import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronLeft, Clock, RotateCcw, Settings, Lock, Save, X, Volume2, QrCode, Maximize, Minimize, AlertCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';

// Your Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD_lJ0aUpX7CjxUeN0vnsz5Ufl_7TFIwoY",
  authDomain: "event-queue-3501b.firebaseapp.com",
  projectId: "event-queue-3501b",
  storageBucket: "event-queue-3501b.firebasestorage.app",
  messagingSenderId: "776134294873",
  appId: "1:776134294873:web:caf7ea2650dac32008a048",
  measurementId: "G-EV1WN8GCJ0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "event-queue-production";

// Helper functions for Alphanumeric tickets (A01...A99, B01...B99)
const getTicketParts = (num) => {
  const n = Number(num);
  if (isNaN(n) || n < 1) return { prefix: 'A', suffix: 1 };
  const prefixIndex = Math.floor((n - 1) / 99);
  const prefixChar = String.fromCharCode(65 + (prefixIndex % 26));
  const suffixNum = ((n - 1) % 99) + 1;
  return { prefix: prefixChar, suffix: suffixNum };
};

const parseTicketParts = (prefix, suffix) => {
  const prefixIndex = (prefix || 'A').charCodeAt(0) - 65;
  const suffixNum = Math.max(1, Number(suffix) || 1);
  return (prefixIndex * 99) + suffixNum;
};

const formatTicketNumber = (num) => {
  const { prefix, suffix } = getTicketParts(num);
  return `${prefix}${String(suffix).padStart(2, '0')}`;
};

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const isAttendee = urlParams.get('attendee') === 'true';
  const initialZone = urlParams.get('zone') || 'zone1';

  const [user, setUser] = useState(null);
  const [view, setView] = useState('main');
  const [zoneId, setZoneId] = useState(initialZone);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  // App State
  const [currentStart, setCurrentStart] = useState(1);
  const [batchSize, setBatchSize] = useState(5);
  const [maxTicket, setMaxTicket] = useState(2000);
  const [eventNameEN, setEventNameEN] = useState('Event Queue');
  const [eventNameZH, setEventNameZH] = useState('活動隊列');
  const [servingTextEN, setServingTextEN] = useState('Now Serving');
  const [servingTextZH, setServingTextZH] = useState('現正服務');
  const [logoText, setLogoText] = useState('EQ');
  const [enableAudio, setEnableAudio] = useState(false);
  const [zoneName, setZoneName] = useState('Zone 1');

  const [currentTime, setCurrentTime] = useState(new Date());
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [audioReady, setAudioReady] = useState(false);
  const [draftSettings, setDraftSettings] = useState({});
  
  const prevStartRef = useRef(1);
  const animateRef = useRef(0);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      setToastMsg("Fullscreen restricted. Open in a direct tab to enable.");
      setTimeout(() => setToastMsg(''), 5000);
    }
  };

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'queueState', zoneId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentStart(data.currentStart || 1);
        setBatchSize(data.batchSize || 5);
        setMaxTicket(data.maxTicket || 2000);
        setEventNameEN(data.eventNameEN || 'Event Queue');
        setEventNameZH(data.eventNameZH || '活動隊列');
        setServingTextEN(data.servingTextEN || 'Now Serving');
        setServingTextZH(data.servingTextZH || '現正服務');
        setLogoText(data.logoText || 'EQ');
        setEnableAudio(data.enableAudio || false);
        setZoneName(data.zoneName || zoneId);
      }
    });
    return () => unsubscribe();
  }, [user, zoneId]);

  const updateState = async (updates, targetZone = zoneId) => {
    if (updates.currentStart !== undefined) setCurrentStart(updates.currentStart);
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'queueState', targetZone);
      await setDoc(docRef, updates, { merge: true });
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const playAudioAlerts = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, time) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
        gain.gain.setValueAtTime(0, ctx.currentTime + time);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + 0.5);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.6);
      };
      playTone(523.25, 0); playTone(659.25, 0.2);

      if ('speechSynthesis' in window) {
        setTimeout(() => {
          const endNum = Math.min(currentStart + batchSize - 1, maxTicket);
          const startFmt = formatTicketNumber(currentStart).split('').join(' ');
          const endFmt = formatTicketNumber(endNum).split('').join(' ');
          const utteranceZH = new SpeechSynthesisUtterance(`請 ${startFmt} 到 ${endFmt} 號`);
          utteranceZH.lang = 'zh-TW';
          const utteranceEN = new SpeechSynthesisUtterance(`Ticket ${startFmt} to ${endFmt}`);
          utteranceEN.lang = 'en-US';
          window.speechSynthesis.speak(utteranceZH);
          window.speechSynthesis.speak(utteranceEN);
        }, 800);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (currentStart !== prevStartRef.current) {
      animateRef.current += 1;
      if (enableAudio && audioReady && !isAttendee) playAudioAlerts();
      prevStartRef.current = currentStart;
    }
  }, [currentStart, enableAudio, audioReady, isAttendee]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (view !== 'main' || isAttendee) return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStart, view, batchSize, maxTicket, isAttendee]);

  const handleNext = () => {
    if (currentStart + batchSize <= maxTicket) updateState({ currentStart: currentStart + batchSize });
  };

  const handlePrev = () => {
    if (currentStart - batchSize >= 1) updateState({ currentStart: currentStart - batchSize });
  };

  const handleReset = () => {
    if (confirm("Reset queue?")) updateState({ currentStart: 1 });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'admin123') {
      const s = getTicketParts(currentStart);
      const m = getTicketParts(maxTicket);
      setDraftSettings({ 
        startPrefix: s.prefix, startSuffix: s.suffix, batch: batchSize, 
        maxPrefix: m.prefix, maxSuffix: m.suffix,
        eventNameEN, eventNameZH, servingTextEN, servingTextZH,
        logoText, enableAudio, zoneId, zoneName
      });
      setView('settings'); setPassword(''); setLoginError('');
    } else setLoginError('Incorrect password');
  };

  const handleZoneChange = async (e) => {
    const nid = e.target.value;
    setDraftSettings(p => ({ ...p, zoneId: nid }));
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'queueState', nid));
    if (snap.exists()) {
      const d = snap.data();
      const s = getTicketParts(d.currentStart || 1);
      const m = getTicketParts(d.maxTicket || 2000);
      setDraftSettings(p => ({
        ...p, startPrefix: s.prefix, startSuffix: s.suffix, batch: d.batchSize || 5,
        maxPrefix: m.prefix, maxSuffix: m.suffix, zoneName: d.zoneName || nid,
        eventNameEN: d.eventNameEN || p.eventNameEN, eventNameZH: d.eventNameZH || p.eventNameZH,
        logoText: d.logoText || p.logoText, enableAudio: d.enableAudio || false
      }));
    } else {
      setDraftSettings(p => ({ ...p, startPrefix: 'A', startSuffix: 1, batch: 5, maxPrefix: 'U', maxSuffix: 20, zoneName: nid }));
    }
  };

  const saveSettings = () => {
    const tz = draftSettings.zoneId;
    setZoneId(tz); setZoneName(draftSettings.zoneName);
    updateState({
      currentStart: parseTicketParts(draftSettings.startPrefix, draftSettings.startSuffix),
      batchSize: Number(draftSettings.batch),
      maxTicket: parseTicketParts(draftSettings.maxPrefix, draftSettings.maxSuffix),
      eventNameEN: draftSettings.eventNameEN, eventNameZH: draftSettings.eventNameZH,
      servingTextEN: draftSettings.servingTextEN, servingTextZH: draftSettings.servingTextZH,
      logoText: draftSettings.logoText, enableAudio: draftSettings.enableAudio, zoneName: draftSettings.zoneName
    }, tz);
    setView('main');
  };

  const currentNumbers = Array.from({ length: Math.max(0, Math.min(batchSize, maxTicket - currentStart + 1)) }, (_, i) => currentStart + i);

  if (view === 'login') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
      <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold">管理員登入 / Admin Access</h2>
          <X className="cursor-pointer" onClick={() => setView('main')} />
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" placeholder="Password" autoFocus />
          {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
          <button type="submit" className="w-full bg-blue-600 py-3 rounded-xl font-bold">登入 / Login</button>
        </form>
      </div>
    </div>
  );

  if (view === 'settings') return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="p-6 border-b border-slate-800 flex justify-between items-center">
        <h1 className="text-xl font-bold">設定 / Settings</h1>
        <X className="cursor-pointer" onClick={() => setView('main')} />
      </header>
      <main className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="text" value={draftSettings.eventNameZH} onChange={e => setDraftSettings({...draftSettings, eventNameZH: e.target.value})} className="bg-slate-900 p-3 rounded-xl border border-slate-700" placeholder="活動名稱 ZH" />
          <input type="text" value={draftSettings.eventNameEN} onChange={e => setDraftSettings({...draftSettings, eventNameEN: e.target.value})} className="bg-slate-900 p-3 rounded-xl border border-slate-700" placeholder="Event Name EN" />
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl space-y-4">
          <label className="block text-sm">區域 / Zone</label>
          <select value={draftSettings.zoneId} onChange={handleZoneChange} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700">
            <option value="zone1">Zone 1</option><option value="zone2">Zone 2</option><option value="zone3">Zone 3</option>
          </select>
          <input type="text" value={draftSettings.zoneName} onChange={e => setDraftSettings({...draftSettings, zoneName: e.target.value})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700" placeholder="Zone Display Name" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs mb-1">起始 / Start</label>
            <div className="flex space-x-1">
              <select value={draftSettings.startPrefix} onChange={e => setDraftSettings({...draftSettings, startPrefix: e.target.value})} className="bg-slate-950 p-2 rounded border border-slate-700">{Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).map(c=><option key={c} value={c}>{c}</option>)}</select>
              <input type="number" value={draftSettings.startSuffix} onChange={e => setDraftSettings({...draftSettings, startSuffix: e.target.value})} className="bg-slate-950 p-2 rounded border border-slate-700 w-full" />
            </div>
          </div>
          <input type="number" value={draftSettings.batch} onChange={e => setDraftSettings({...draftSettings, batch: e.target.value})} className="bg-slate-900 p-3 rounded-xl border border-slate-700" placeholder="Batch Size" />
          <div>
            <label className="block text-xs mb-1">最大 / Max</label>
            <div className="flex space-x-1">
              <select value={draftSettings.maxPrefix} onChange={e => setDraftSettings({...draftSettings, maxPrefix: e.target.value})} className="bg-slate-950 p-2 rounded border border-slate-700">{Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).map(c=><option key={c} value={c}>{c}</option>)}</select>
              <input type="number" value={draftSettings.maxSuffix} onChange={e => setDraftSettings({...draftSettings, maxSuffix: e.target.value})} className="bg-slate-950 p-2 rounded border border-slate-700 w-full" />
            </div>
          </div>
        </div>
        <label className="flex items-center space-x-3 bg-slate-900 p-4 rounded-xl">
          <input type="checkbox" checked={draftSettings.enableAudio} onChange={e => setDraftSettings({...draftSettings, enableAudio: e.target.checked})} />
          <span>啟用音效 / Enable Audio</span>
        </label>
        <button onClick={saveSettings} className="w-full bg-blue-600 py-4 rounded-xl font-bold flex items-center justify-center"><Save className="mr-2" /> 儲存 / Save</button>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <style>{`@keyframes pop { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } } .animate-pop { animation: pop 0.5s ease-out forwards; }`}</style>
      {toastMsg && <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-800 px-6 py-3 rounded-full z-50 border border-slate-700">{toastMsg}</div>}
      {enableAudio && !audioReady && !isAttendee && <div onClick={() => setAudioReady(true)} className="bg-green-600 p-3 text-center cursor-pointer font-bold">點擊啟用音效 / Enable Sound</div>}
      
      <header className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center font-black">{logoText}</div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl md:text-2xl font-bold">{eventNameZH}</h1>
              <span className="text-[10px] bg-blue-600/30 px-1 rounded border border-blue-500/50">{zoneName}</span>
            </div>
            <h2 className="text-xs text-slate-400">{eventNameEN}</h2>
          </div>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 font-mono text-xl tabular-nums">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className={`flex-1 flex flex-col items-center justify-center p-6 ${!isAttendee ? 'md:w-2/3' : 'w-full'}`}>
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-bold mb-2">{servingTextZH}</h2>
            <h3 className="text-xl text-slate-400 uppercase tracking-widest">{servingTextEN}</h3>
          </div>
          <div className="flex flex-wrap justify-center gap-6" key={animateRef.current}>
            {currentNumbers.map((num, i) => (
              <div key={num} className="animate-pop bg-slate-900 border-2 border-slate-700 rounded-3xl p-8 w-[240px] text-center shadow-2xl" style={{ animationDelay: `${i*0.1}s`, borderColor: i === Math.floor(batchSize/2) ? '#3b82f6' : '#334155' }}>
                <span className="text-6xl md:text-7xl font-black">{formatTicketNumber(num)}</span>
              </div>
            ))}
          </div>
        </div>
        {!isAttendee && (
          <div className="md:w-1/3 bg-slate-950/40 p-8 border-l border-slate-800 flex flex-col items-center justify-center">
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700 text-center space-y-4">
              <h4 className="font-bold">掃描追蹤 / Scan to Follow</h4>
              <div className="bg-white p-2 rounded-xl">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?attendee=true&zone=' + zoneId)}`} alt="QR" className="w-40 h-40" />
              </div>
              <p className="text-xs text-slate-500">Live Mobile Queue</p>
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 border-t border-slate-800 bg-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
        {isAttendee ? (
          <p className="w-full text-center text-slate-500">實時觀看 / Viewing Live: <span className="text-blue-400">{zoneName}</span></p>
        ) : (
          <>
            <div className="flex space-x-4">
              <button onClick={() => setView('login')} className="flex items-center text-slate-400 hover:text-white"><Settings className="w-4 h-4 mr-1" /> 設定</button>
              <button onClick={handleReset} className="flex items-center text-slate-400 hover:text-red-400"><RotateCcw className="w-4 h-4 mr-1" /> 重置</button>
              <button onClick={toggleFullscreen} className="flex items-center text-slate-400 hover:text-purple-400"><Maximize className="w-4 h-4 mr-1" /> 全螢幕</button>
            </div>
            <div className="flex space-x-4 w-full md:w-auto">
              <button onClick={handlePrev} disabled={currentStart<=1} className="flex-1 md:flex-none bg-slate-700 px-6 py-3 rounded-xl flex items-center justify-center disabled:opacity-30"><ChevronLeft /> 上一組</button>
              <button onClick={handleNext} disabled={currentStart+batchSize>maxTicket} className="flex-1 md:flex-none bg-blue-600 px-6 py-3 rounded-xl flex items-center justify-center disabled:opacity-30">下一組 <ChevronRight /></button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
