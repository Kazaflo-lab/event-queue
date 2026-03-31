import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronLeft, Clock, RotateCcw, Settings, Lock, Save, X, Volume2, QrCode, Maximize, Minimize, AlertCircle, ChevronDown } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';

// Firebase Configuration
const getApiKey = () => {
  try {
    return (import.meta && import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) 
      || "AIzaSyD_lJ0aUpX7CjxUeN0vnsz5Ufl_7TFIwoY";
  } catch (e) {
    return "AIzaSyD_lJ0aUpX7CjxUeN0vnsz5Ufl_7TFIwoY";
  }
};

const firebaseConfig = {
  apiKey: getApiKey(),
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

// Helper functions for dynamic Alphanumeric tickets
const getTicketParts = (num, maxPerLetter = 99) => {
  const n = Number(num);
  if (isNaN(n) || n < 1) return { prefix: 'A', suffix: 1 };
  const prefixIndex = Math.floor((n - 1) / maxPerLetter);
  const prefixChar = String.fromCharCode(65 + (prefixIndex % 26));
  const suffixNum = ((n - 1) % maxPerLetter) + 1;
  return { prefix: prefixChar, suffix: suffixNum };
};

const parseTicketParts = (prefix, suffix, maxPerLetter = 99) => {
  const prefixIndex = (prefix || 'A').charCodeAt(0) - 65;
  const suffixNum = Math.max(1, Number(suffix) || 1);
  return (prefixIndex * maxPerLetter) + suffixNum;
};

const formatTicketNumber = (num, maxPerLetter = 99) => {
  const { prefix, suffix } = getTicketParts(num, maxPerLetter);
  // Pad based on maxPerLetter digits
  const padding = maxPerLetter >= 100 ? 3 : 2;
  return `${prefix}${String(suffix).padStart(padding, '0')}`;
};

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const isAttendee = urlParams.get('attendee') === 'true';
  const initialZone = urlParams.get('zone') || 'zone1';

  const [user, setUser] = useState(null);
  const [view, setView] = useState('main');
  const [zoneId, setZoneId] = useState(initialZone);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  // App State
  const [currentStart, setCurrentStart] = useState(1);
  const [batchSize, setBatchSize] = useState(5);
  const [maxTicket, setMaxTicket] = useState(2000);
  const [maxPerLetter, setMaxPerLetter] = useState(99); 
  const [eventNameEN, setEventNameEN] = useState('Event Queue');
  const [eventNameZH, setEventNameZH] = useState('活動隊列');
  const [servingTextEN, setServingTextEN] = useState('Now Calling');
  const [servingTextZH, setServingTextZH] = useState('正在叫號');
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
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'queueState', zoneId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentStart(data.currentStart || 1);
        setBatchSize(data.batchSize || 5);
        setMaxTicket(data.maxTicket || 2000);
        setMaxPerLetter(data.maxPerLetter || 99);
        setEventNameEN(data.eventNameEN || 'Event Queue');
        setEventNameZH(data.eventNameZH || '活動隊列');
        setServingTextEN(data.servingTextEN || 'Now Calling');
        setServingTextZH(data.servingTextZH || '正在叫號');
        setLogoText(data.logoText || 'EQ');
        setEnableAudio(data.enableAudio || false);
        setZoneName(data.zoneName || zoneId);
      }
    });
    return () => unsubscribe();
  }, [user, zoneId]);

  const updateState = async (updates, targetZone = zoneId) => {
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
          const startFmt = formatTicketNumber(currentStart, maxPerLetter).split('').join(' ');
          const endFmt = formatTicketNumber(endNum, maxPerLetter).split('').join(' ');
          const utteranceZH = new SpeechSynthesisUtterance(`請 ${startFmt} 到 ${endFmt} 號`);
          utteranceZH.lang = 'zh-HK';
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

  const handleNext = () => {
    if (currentStart + batchSize <= maxTicket) {
      updateState({ currentStart: currentStart + batchSize });
    }
  };

  const handlePrev = () => {
    if (currentStart - batchSize >= 1) {
      updateState({ currentStart: currentStart - batchSize });
    }
  };

  const handleReset = () => {
    if (window.confirm("Reset queue?")) updateState({ currentStart: 1 });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'admin123') {
      const s = getTicketParts(currentStart, maxPerLetter);
      const m = getTicketParts(maxTicket, maxPerLetter);
      setDraftSettings({ 
        startPrefix: s.prefix, startSuffix: s.suffix, batch: batchSize, 
        maxPrefix: m.prefix, maxSuffix: m.suffix, maxPerLetter: maxPerLetter,
        eventNameEN, eventNameZH, servingTextEN, servingTextZH,
        logoText, enableAudio, zoneId, zoneName
      });
      setView('settings'); setPassword(''); setLoginError('');
    } else setLoginError('Incorrect password');
  };

  const handleZoneChange = async (e) => {
    const nid = e.target.value;
    
    // If we're in the settings view, update the draft
    if (view === 'settings') {
      setDraftSettings(p => ({ ...p, zoneId: nid }));
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'queueState', nid));
      if (snap.exists()) {
        const d = snap.data();
        const currentMaxPL = d.maxPerLetter || 99;
        const s = getTicketParts(d.currentStart || 1, currentMaxPL);
        const m = getTicketParts(d.maxTicket || 2000, currentMaxPL);
        setDraftSettings(p => ({
          ...p, startPrefix: s.prefix, startSuffix: s.suffix, batch: d.batchSize || 5,
          maxPrefix: m.prefix, maxSuffix: m.suffix, maxPerLetter: currentMaxPL,
          zoneName: d.zoneName || nid, eventNameEN: d.eventNameEN || p.eventNameEN,
          eventNameZH: d.eventNameZH || p.eventNameZH, servingTextEN: d.servingTextEN || p.servingTextEN,
          servingTextZH: d.servingTextZH || p.servingTextZH, logoText: d.logoText || p.logoText,
          enableAudio: d.enableAudio || false, zoneId: nid
        }));
      }
    } else {
      // If we're in the main view, just switch the active zone
      setZoneId(nid);
    }
  };

  const saveSettings = () => {
    const tz = draftSettings.zoneId;
    const mpl = Number(draftSettings.maxPerLetter) || 99;
    setZoneId(tz); // Ensure the app switches to the zone we just saved
    updateState({
      currentStart: parseTicketParts(draftSettings.startPrefix, draftSettings.startSuffix, mpl),
      batchSize: Number(draftSettings.batch),
      maxTicket: parseTicketParts(draftSettings.maxPrefix, draftSettings.maxSuffix, mpl),
      maxPerLetter: mpl,
      eventNameEN: draftSettings.eventNameEN, eventNameZH: draftSettings.eventNameZH,
      servingTextEN: draftSettings.servingTextEN, servingTextZH: draftSettings.servingTextZH,
      logoText: draftSettings.logoText || 'EQ', enableAudio: draftSettings.enableAudio, zoneName: draftSettings.zoneName
    }, tz);
    setView('main');
  };

  const currentNumbers = Array.from({ length: Math.max(0, Math.min(batchSize, maxTicket - currentStart + 1)) }, (_, i) => currentStart + i);

  if (view === 'login') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100 font-sans">
      <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold">管理員登入 / Admin Access</h2>
          <X className="cursor-pointer hover:text-red-400" onClick={() => setView('main')} />
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none" placeholder="Password" autoFocus />
          {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
          <button type="submit" className="w-full bg-blue-600 py-3 rounded-xl font-bold">登入 / Login</button>
        </form>
      </div>
    </div>
  );

  if (view === 'settings') return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-20">
        <h1 className="text-xl font-bold">設定 / Settings</h1>
        <X className="cursor-pointer hover:text-red-400 transition-colors" onClick={() => setView('main')} />
      </header>
      <main className="p-6 max-w-4xl mx-auto space-y-8 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">活動名稱 (ZH)</label>
            <input type="text" value={draftSettings.eventNameZH} onChange={e => setDraftSettings({...draftSettings, eventNameZH: e.target.value})} className="w-full bg-slate-900 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors" placeholder="活動名稱 ZH" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Event Name (EN)</label>
            <input type="text" value={draftSettings.eventNameEN} onChange={e => setDraftSettings({...draftSettings, eventNameEN: e.target.value})} className="w-full bg-slate-900 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors" placeholder="Event Name EN" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">提示文字 (Announcement ZH)</label>
            <input type="text" value={draftSettings.servingTextZH} onChange={e => setDraftSettings({...draftSettings, servingTextZH: e.target.value})} className="w-full bg-slate-900 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors" placeholder="正在叫號" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Announcement Text (EN)</label>
            <input type="text" value={draftSettings.servingTextEN} onChange={e => setDraftSettings({...draftSettings, servingTextEN: e.target.value})} className="w-full bg-slate-900 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors" placeholder="Now Calling" />
          </div>
          <div className="space-y-2 mt-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">標誌文字 / Logo Text (Max 3 chars)</label>
            <input type="text" maxLength={3} value={draftSettings.logoText || ''} onChange={e => setDraftSettings({...draftSettings, logoText: e.target.value})} className="w-full bg-slate-900 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors uppercase" placeholder="EQ" />
          </div>
          <div className="space-y-2 mt-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">字母進位上限 / Max per Alphabet</label>
            <input type="number" min="10" max="999" value={draftSettings.maxPerLetter} onChange={e => setDraftSettings({...draftSettings, maxPerLetter: e.target.value})} className="w-full bg-slate-900 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors" placeholder="99" />
            <p className="text-[10px] text-slate-500">e.g. 50 means A50 jumps to B01</p>
          </div>
        </div>
        
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6">
          <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest">區域配置 / Zone Configuration</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400">選擇操作區域 / Select Zone</label>
              <select value={draftSettings.zoneId} onChange={handleZoneChange} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors cursor-pointer">
                <option value="zone1">Zone 1</option><option value="zone2">Zone 2</option><option value="zone3">Zone 3</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">區域顯示名稱 / Zone Name</label>
              <input type="text" value={draftSettings.zoneName} onChange={e => setDraftSettings({...draftSettings, zoneName: e.target.value})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 focus:border-blue-500 outline-none transition-colors" placeholder="Zone Display Name" />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6">
          <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest">隊列參數 / Queue Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">起始號碼 / Start</label>
              <div className="flex space-x-2">
                <select value={draftSettings.startPrefix} onChange={e => setDraftSettings({...draftSettings, startPrefix: e.target.value})} className="bg-slate-950 p-3 rounded-xl border border-slate-700 outline-none w-20 text-center cursor-pointer">{Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).map(c=><option key={c} value={c}>{c}</option>)}</select>
                <input type="number" value={draftSettings.startSuffix} onChange={e => setDraftSettings({...draftSettings, startSuffix: e.target.value})} className="bg-slate-950 p-3 rounded-xl border border-slate-700 outline-none w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">每批數量 / Batch</label>
              <input type="number" value={draftSettings.batch} onChange={e => setDraftSettings({...draftSettings, batch: e.target.value})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 outline-none" placeholder="Batch Size" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">最大號碼 / Max</label>
              <div className="flex space-x-2">
                <select value={draftSettings.maxPrefix} onChange={e => setDraftSettings({...draftSettings, maxPrefix: e.target.value})} className="bg-slate-950 p-3 rounded-xl border border-slate-700 outline-none w-20 text-center cursor-pointer">{Array.from({length:26},(_,i)=>String.fromCharCode(65+i)).map(c=><option key={c} value={c}>{c}</option>)}</select>
                <input type="number" value={draftSettings.maxSuffix} onChange={e => setDraftSettings({...draftSettings, maxSuffix: e.target.value})} className="bg-slate-950 p-3 rounded-xl border border-slate-700 outline-none w-full" />
              </div>
            </div>
          </div>
        </div>

        <label className="flex items-center space-x-4 bg-slate-900 p-5 rounded-3xl border border-slate-800 cursor-pointer hover:border-green-500/50 transition-colors">
          <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${draftSettings.enableAudio ? 'bg-green-600 border-green-600' : 'border-slate-600'}`}>
            <input type="checkbox" className="hidden" checked={draftSettings.enableAudio} onChange={e => setDraftSettings({...draftSettings, enableAudio: e.target.checked})} />
            {draftSettings.enableAudio && <div className="w-2 h-2 bg-white rounded-full"></div>}
          </div>
          <span className="font-medium">啟用音效與語音播報 / Enable Audio & Voice</span>
        </label>
        
        <button onClick={saveSettings} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold flex items-center justify-center shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"><Save className="w-6 h-6 mr-2" /> 儲存並同步 / Save & Sync</button>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100 font-sans selection:bg-blue-500/30">
      <style>{`
        @keyframes pop { 0% { opacity: 0; transform: scale(0.9) translateY(20px); } 100% { opacity: 1; transform: scale(1) translateY(0); } } 
        .animate-pop { animation: pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
      
      {toastMsg && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-800 px-6 py-3 rounded-full z-50 border border-slate-700 shadow-2xl flex items-center animate-pop">
          <AlertCircle className="w-4 h-4 mr-2 text-yellow-400" />
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}
      
      {enableAudio && !audioReady && !isAttendee && (
        <div 
          onClick={() => setAudioReady(true)} 
          className="bg-green-600 p-4 text-center cursor-pointer font-bold animate-pulse sticky top-0 z-30 shadow-lg"
        >
          <Volume2 className="inline-block mr-2 w-5 h-5" />
          點擊此處以啟用音效播報 / Click here to enable sound announcements
        </div>
      )}
      
      <header className="p-6 md:p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center space-x-5">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-xl md:text-2xl shadow-lg shadow-blue-500/20 uppercase tracking-tighter">
            {logoText}
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-3 mb-1">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{eventNameZH}</h1>
              
              {/* Changeable Zone Dropdown Menu */}
              <div className="relative group">
                <select 
                  value={zoneId} 
                  onChange={handleZoneChange}
                  className="appearance-none bg-blue-600/30 text-blue-400 text-lg md:text-xl font-bold px-4 py-1 pr-10 rounded-lg border border-blue-500/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-blue-600/40 transition-all uppercase tracking-wider"
                >
                  <option value="zone1" className="bg-slate-900 text-white">Zone 1</option>
                  <option value="zone2" className="bg-slate-900 text-white">Zone 2</option>
                  <option value="zone3" className="bg-slate-900 text-white">Zone 3</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <h2 className="text-sm text-slate-400 font-medium">{eventNameEN}</h2>
          </div>
        </div>
        <div className="bg-slate-800 px-5 py-3 rounded-2xl border border-slate-700 font-mono text-2xl md:text-3xl tabular-nums shadow-inner text-slate-200">
          <Clock className="inline-block mr-2 w-6 h-6 text-blue-500" />
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="absolute inset-0 bg-blue-600/5 blur-[120px] pointer-events-none rounded-full translate-y-1/2"></div>
        
        <div className={`flex-1 flex flex-col items-center justify-center p-6 md:p-12 z-10 ${!isAttendee ? 'md:w-2/3' : 'w-full'}`}>
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-5xl md:text-8xl font-black mb-4 tracking-tight drop-shadow-sm">{servingTextZH}</h2>
            <h3 className="text-xl md:text-3xl text-slate-400 uppercase tracking-[0.2em] font-semibold">{servingTextEN}</h3>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 md:gap-10" key={`anim-${animateRef.current}`}>
            {currentNumbers.map((num, i) => (
              <div 
                key={num} 
                className="animate-pop bg-slate-900 border-2 border-slate-700 rounded-[2.5rem] p-10 md:p-14 w-full sm:w-[320px] text-center shadow-2xl transition-all" 
                style={{ 
                  animationDelay: `${i*0.1}s`, 
                  borderColor: i === Math.floor(batchSize/2) ? '#3b82f6' : '#334155',
                  boxShadow: i === Math.floor(batchSize/2) ? '0 25px 50px -12px rgba(59, 130, 246, 0.25)' : 'none'
                }}
              >
                <span className="text-7xl md:text-9xl font-black tracking-tighter tabular-nums drop-shadow-md">
                  {formatTicketNumber(num, maxPerLetter)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!isAttendee && (
          <div className="md:w-1/3 bg-slate-950/40 p-8 border-l border-slate-800 flex flex-col items-center justify-center z-10">
            <div className="bg-slate-900 p-10 rounded-[3rem] border border-slate-700 text-center space-y-6 shadow-2xl max-w-sm w-full transition-transform hover:scale-[1.02]">
              <div className="space-y-2">
                <h4 className="font-bold text-xl">掃描追蹤實時隊列</h4>
                <p className="text-sm text-slate-400">Scan to Follow Live Queue</p>
              </div>
              <div className="bg-white p-5 rounded-3xl shadow-inner">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?attendee=true&zone=' + zoneId)}`} 
                  alt="QR" 
                  className="w-full aspect-square" 
                />
              </div>
              <div className="flex items-center justify-center space-x-2 text-blue-400 bg-blue-900/20 px-4 py-2 rounded-full border border-blue-500/20">
                <QrCode className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Live Mobile Queue</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 md:p-8 border-t border-slate-800 bg-slate-900 flex flex-col md:flex-row justify-between items-center gap-6 z-10">
        {isAttendee ? (
          <div className="w-full flex items-center justify-center space-x-3 text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <p>實時觀看 / Viewing Live: <span className="text-blue-400 font-bold">{zoneName}</span></p>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-6">
              <button onClick={() => setView('login')} className="flex items-center text-slate-400 hover:text-blue-400 transition-colors font-medium text-sm">
                <Settings className="w-4 h-4 mr-2" /> 設定 / Settings
              </button>
              <button onClick={handleReset} className="flex items-center text-slate-400 hover:text-red-400 transition-colors font-medium text-sm">
                <RotateCcw className="w-4 h-4 mr-2" /> 重置 / Reset
              </button>
            </div>
            
            <div className="flex space-x-4 w-full md:w-auto">
              <button 
                onClick={handlePrev} 
                disabled={currentStart <= 1} 
                className="flex-1 md:flex-none bg-slate-800 border border-slate-700 hover:bg-slate-750 px-8 py-5 rounded-[1.5rem] flex items-center justify-center disabled:opacity-20 transition-all active:scale-95 shadow-lg"
              >
                <ChevronLeft className="mr-2" /> 
                <div className="text-left leading-tight">
                  <div className="text-lg font-bold">上一組</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Prev</div>
                </div>
              </button>
              <button 
                onClick={handleNext} 
                disabled={currentStart + batchSize > maxTicket} 
                className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 px-8 py-5 rounded-[1.5rem] flex items-center justify-center disabled:opacity-20 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                <div className="text-right leading-tight mr-2">
                  <div className="text-lg font-bold">下一組</div>
                  <div className="text-[10px] text-blue-200 uppercase font-bold">Next</div>
                </div>
                <ChevronRight />
              </button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
