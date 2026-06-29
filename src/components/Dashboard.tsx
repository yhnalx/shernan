import React, { useState, useEffect, useCallback, useRef } from 'react';
import { mockFirebase } from '../firebase';
import type { ClassificationLog } from '../firebase';
import { ThroughputChart, MaterialsChart } from './Analytics';
import { 
  Coins, 
  CheckCircle, 
  Clock, 
  Database,
  Volume2, 
  VolumeX,
  Copy,
  CheckCircle2,
  ArrowRight,
  Play,
  RotateCcw,
  Sparkles,
  Smartphone,
  Cpu
} from 'lucide-react';

const PRESET_BOTTLES = [
  {
    id: 'pet-bottle-1',
    name: 'PET Water Bottle',
    label: 'PET Bottle',
    isPet: true,
    confidence: 0.98,
    url: 'https://images.unsplash.com/photo-1595278069441-2cf29f8db0d8?w=500&auto=format&fit=crop&q=60'
  },
  {
    id: 'soda-can-1',
    name: 'Aluminium Soda Can',
    label: 'Soda Can (Aluminium)',
    isPet: false,
    confidence: 0.95,
    url: 'https://images.unsplash.com/photo-1527960656366-ee2a999e32e6?w=500&auto=format&fit=crop&q=60'
  },
  {
    id: 'glass-bottle-1',
    name: 'Glass Beer Bottle',
    label: 'Glass Bottle',
    isPet: false,
    confidence: 0.89,
    url: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500&auto=format&fit=crop&q=60'
  },
  {
    id: 'shampoo-bottle-1',
    name: 'HDPE Detergent Bottle',
    label: 'Other Plastic (HDPE)',
    isPet: false,
    confidence: 0.91,
    url: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=500&auto=format&fit=crop&q=60'
  }
];

type KioskState = 'idle' | 'active' | 'processing' | 'result' | 'return';

export const Dashboard: React.FC = () => {
  const [logs, setLogs] = useState<ClassificationLog[]>([]);
  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [sessionPoints, setSessionPoints] = useState<number>(0);
  const [sessionBottles, setSessionBottles] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<{
    label: string;
    isPet: boolean;
    confidence: number;
    url: string;
  } | null>(null);
  
  const [claimedVouchers, setClaimedVouchers] = useState<{
    code: string;
    points: number;
    timestamp: string;
  }[]>(() => [
    { code: 'ECO-R9P2-PTS', points: 30, timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString() },
    { code: 'ECO-A3K8-PTS', points: 10, timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
    { code: 'ECO-W5F7-PTS', points: 50, timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString() },
    { code: 'ECO-X2D9-PTS', points: 20, timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString() },
    { code: 'ECO-V7N4-PTS', points: 40, timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString() }
  ]);

  const [activeSessionTimer, setActiveSessionTimer] = useState<number>(60);
  const [binOccupancy, setBinOccupancy] = useState<number>(18.5);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  const playSound = useCallback((type: 'beep' | 'success' | 'reject') => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'beep') {
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
        osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else if (type === 'reject') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.setValueAtTime(147, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      console.warn('Audio feedback failed', e);
    }
  }, [soundEnabled]);

  const handleClaimPoints = useCallback(() => {
    if (kioskState !== 'active') return;
    setKioskState('return');
    playSound('success');

    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ECO-';
    for (let i = 0; i < 4; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    code += '-PTS';

    const newVoucher = {
      code,
      points: sessionPoints,
      timestamp: new Date().toISOString()
    };

    if (sessionPoints > 0) {
      setClaimedVouchers(prev => [newVoucher, ...prev]);
    }

    setTimeout(() => {
      setKioskState('idle');
      setSessionPoints(0);
      setSessionBottles(0);
    }, 6000);
  }, [kioskState, playSound, sessionPoints]);

  const handleStartSession = () => {
    playSound('beep');
    setSessionPoints(0);
    setSessionBottles(0);
    setActiveSessionTimer(60);
    setKioskState('active');
  };

  // Sync classification logs
  useEffect(() => {
    const unsubscribeLogs = mockFirebase.subscribeLogs(setLogs);
    return () => unsubscribeLogs();
  }, []);

  // Active state timer countdown
  useEffect(() => {
    if (kioskState !== 'active') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setActiveSessionTimer(prev => {
        if (prev <= 1) {
          handleClaimPoints();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [kioskState, handleClaimPoints]);

  const handleInsertBottle = async (bottle: typeof PRESET_BOTTLES[0]) => {
    if (kioskState !== 'active') return;
    
    // 1. Move to Processing State
    setKioskState('processing');
    playSound('beep');

    // Simulate classification processing delay
    await new Promise(resolve => setTimeout(resolve, 1800));

    // 2. Set result and transition to Result State
    const isPet = bottle.isPet;
    const confidence = bottle.confidence;
    const pointsAwarded = isPet ? 10 : 0;

    setCurrentResult({
      label: bottle.label,
      isPet,
      confidence,
      url: bottle.url
    });
    setKioskState('result');

    if (isPet) {
      setSessionPoints(prev => prev + pointsAwarded);
      setSessionBottles(prev => prev + 1);
      setBinOccupancy(prev => Math.min(100, parseFloat((prev + 1.2).toFixed(1))));
      playSound('success');
    } else {
      playSound('reject');
    }

    // Write to persistent classification logs history
    await mockFirebase.triggerClassification(
      bottle.label,
      bottle.isPet,
      bottle.confidence,
      bottle.url
    );

    // 3. Keep results visible for 2.5 seconds, then automatically revert to Active State
    await new Promise(resolve => setTimeout(resolve, 2500));
    setKioskState('active');
    setCurrentResult(null);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopyFeedback(code);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleResetData = () => {
    if (window.confirm('Reset all transaction session tickets, statistics, and logs?')) {
      mockFirebase.resetMockData();
      setClaimedVouchers([]);
      setSessionPoints(0);
      setSessionBottles(0);
      setBinOccupancy(18.5);
      setKioskState('idle');
    }
  };

  const totalRecycledCount = logs.filter(l => l.isPet).length;
  const lifetimePoints = logs.reduce((sum, log) => sum + log.pointsAdded, 0);

  return (
    <div className="max-w-7xl mx-auto w-full min-h-screen p-6 md:p-8 flex flex-col gap-6 bg-slate-50">
      
      {/* Top Header Navbar */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200">
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-emerald-600 animate-[pulse_2s_infinite_ease-in-out]" />
            <h1 className="font-sans text-2xl font-extrabold tracking-tight text-slate-900">
              EcoSort <span className="text-emerald-600">Kiosk</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">Deposit PET Bottles • Claim Recycling Points</p>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center">
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs">
              Station ID: ES-KIOSK-049
            </span>
          </div>

          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer text-slate-500 flex items-center justify-center transition-all duration-200 shadow-sm hover:border-slate-400 hover:text-slate-900 hover:bg-slate-50 ${
              soundEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : ''
            }`}
            title={soundEnabled ? 'Disable Audio Feedback' : 'Enable Audio Feedback'}
          >
            {soundEnabled ? <Volume2 className="w-4.5 h-4.5 text-amber-500" /> : <VolumeX className="w-4.5 h-4.5" />}
          </button>

          <button 
            onClick={handleResetData}
            className="bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer text-slate-500 flex items-center justify-center transition-all duration-200 shadow-sm hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50"
            title="Reset Kiosk Data"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 1. Main Hero Grid: Left (SaaS Stat Cards Stacked Vertically), Right (Kiosk Ready for Deposit Card) - EVEN SIZES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* Left Side: SaaS-style cards stacked vertically in one column */}
        <div className="flex flex-col gap-4 h-full">
          
          {/* Card 1: Session Points */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 px-5 flex flex-row items-center gap-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300 transition-all duration-200 ease-out flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-50 text-amber-600">
              <Coins className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-sm font-bold text-slate-900 m-0">Session Points</h3>
              <p className="text-[11px] text-slate-500 leading-normal m-0">Accumulated recycling points in your active session.</p>
            </div>
            <div className="text-lg font-extrabold font-sans flex-shrink-0 text-right min-w-[90px] text-amber-600">
              +{sessionPoints} PTS
            </div>
          </div>

          {/* Card 2: Session Time Limit */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 px-5 flex flex-row items-center gap-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 transition-all duration-200 ease-out flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-600">
              <Clock className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-sm font-bold text-slate-900 m-0">Inactivity Timeout</h3>
              <p className="text-[11px] text-slate-500 leading-normal m-0">Session automatically claims points if timer expires.</p>
            </div>
            <div className="text-lg font-extrabold font-sans flex-shrink-0 text-right min-w-[90px] text-blue-600">
              {kioskState === 'active' ? `${activeSessionTimer}s` : 'Standby'}
            </div>
          </div>

          {/* Card 3: Bottles Recycled */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 px-5 flex flex-row items-center gap-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300 transition-all duration-200 ease-out flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-50 text-emerald-600">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-sm font-bold text-slate-900 m-0">Sorted Bottles</h3>
              <p className="text-[11px] text-slate-500 leading-normal m-0">Number of plastic bottles verified in the current session.</p>
            </div>
            <div className="text-lg font-extrabold font-sans flex-shrink-0 text-right min-w-[90px] text-emerald-600">
              {sessionBottles} Bottles
            </div>
          </div>

          {/* Card 4: Lifetime stats */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 px-5 flex flex-row items-center gap-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-cyan-300 transition-all duration-200 ease-out flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-cyan-50 text-cyan-600">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-sm font-bold text-slate-900 m-0">Lifetime Total</h3>
              <p className="text-[11px] text-slate-500 leading-normal m-0">Total PET bottles sorted and points earned at this station.</p>
            </div>
            <div className="text-lg font-extrabold font-sans flex-shrink-0 text-right min-w-[90px] text-cyan-600">
              {totalRecycledCount} PET ({lifetimePoints} pts)
            </div>
          </div>

        </div>

        {/* Right Side: Ready for Deposit Terminal Card with bottom minimalist hardware status */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:border-emerald-200 transition-all duration-200 flex flex-col justify-between h-full">
          
          {/* Piso Wifi style Captive Interface design */}
          <div className="flex flex-col items-center text-center py-5">
            <div className="relative w-22 h-22 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mb-5">
              <Coins className={`w-12 h-12 ${
                kioskState === 'active' ? 'text-emerald-600 animate-pulse' : 
                kioskState === 'processing' ? 'text-amber-500 animate-spin' : 
                kioskState === 'result' && currentResult?.isPet ? 'text-emerald-600 animate-bounce' :
                'text-slate-400'
              }`} />
            </div>

            {/* Kiosk State visual terminal prompt layout */}
            <div className="max-w-[380px] w-full">
              
              {/* 1. IDLE STATE */}
              {kioskState === 'idle' && (
                <>
                  <h2 className="font-sans text-lg font-bold text-slate-900 mb-2 uppercase tracking-wide">READY FOR DEPOSIT</h2>
                  <p className="text-xs text-slate-600 mb-4 leading-normal">Click START below to initialize a recycling session. Deposit plastic bottles to accumulate redeemable points.</p>
                  <button 
                    onClick={handleStartSession}
                    className="bg-emerald-600 text-white font-sans font-bold text-sm hover:bg-emerald-700 py-3.5 px-6 rounded-xl w-full flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-emerald-100/50 active:scale-[0.98] max-w-[240px] mx-auto mt-4"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    START SESSION
                  </button>
                </>
              )}

              {/* 2. ACTIVE STATE */}
              {kioskState === 'active' && (
                <>
                  <h2 className="font-sans text-lg font-bold text-slate-900 mb-2 uppercase tracking-wide">INSERT BOTTLE</h2>
                  <p className="text-xs text-slate-600 mb-4 leading-normal">Feed your bottle into the physical slot. (Click a simulation drop target below)</p>
                  
                  {/* Inline specimen simulator */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 my-4 w-full">
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_BOTTLES.map(bottle => (
                        <button 
                          key={bottle.id}
                          onClick={() => handleInsertBottle(bottle)}
                          className="bg-white border border-slate-200 p-2 px-3 rounded-xl cursor-pointer flex items-center gap-2 text-left transition-all duration-200 text-slate-800 hover:bg-emerald-50 hover:border-emerald-200 hover:-translate-y-0.5"
                        >
                          <span className="text-sm">
                            {bottle.isPet ? '♻️' : '🗑️'}
                          </span>
                          <div className="text-left">
                            <p className="text-[10px] font-bold m-0">{bottle.name.split(' ')[0]}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 justify-center items-center mt-4">
                    <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full text-amber-600 bg-amber-50 border border-amber-200 animate-pulse">
                      Waiting for bottle...
                    </span>
                    <button 
                      onClick={handleClaimPoints}
                      className="bg-emerald-600 text-white font-sans font-bold text-sm hover:bg-emerald-700 py-2.5 px-6 rounded-full flex items-center gap-2 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-emerald-100/50 active:scale-[0.98] mt-2"
                    >
                      FINISH & CLAIM
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}

              {/* 3. PROCESSING STATE */}
              {kioskState === 'processing' && (
                <>
                  <h2 className="font-sans text-lg font-bold text-amber-600 mb-2 uppercase tracking-wide">ANALYZING BOTTLE...</h2>
                  <p className="text-xs text-slate-600 mb-4 leading-normal">Executing TensorFlow neural network image classification...</p>
                  <div className="w-[140px] h-1 bg-slate-200 rounded-full mx-auto mt-4 overflow-hidden relative">
                    <div className="absolute h-full w-[40%] bg-amber-500 rounded-full animate-[loading-bar_1s_infinite_ease-in-out]" />
                  </div>
                </>
              )}

              {/* 4. RESULT STATE */}
              {kioskState === 'result' && currentResult && (
                <>
                  {currentResult.isPet ? (
                    <>
                      <h2 className="font-sans text-lg font-bold text-emerald-600 mb-2 uppercase tracking-wide">PET BOTTLE DETECTED!</h2>
                      <p className="text-xs text-slate-600 mb-4 leading-normal">Material verified successfully. +10 Points loaded into session wallet.</p>
                      <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full text-emerald-600 bg-emerald-50 border border-emerald-200 shadow-sm shadow-emerald-100">
                        Success: Accepted
                      </span>
                    </>
                  ) : (
                    <>
                      <h2 className="font-sans text-lg font-bold text-rose-600 mb-2 uppercase tracking-wide">NON-PET BOTTLE REJECTED</h2>
                      <p className="text-xs text-slate-600 mb-4 leading-normal">Detected: {currentResult.label}. Bypassing item to trash compartment.</p>
                      <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full text-rose-600 bg-rose-50 border border-rose-200">
                        Rejected: Invalid Item
                      </span>
                    </>
                  )}
                </>
              )}

              {/* 5. RETURN STATE */}
              {kioskState === 'return' && (
                <>
                  <h2 className="font-sans text-lg font-bold text-cyan-600 mb-2 uppercase tracking-wide">POINTS VOUCHER PRINTED</h2>
                  <p className="text-xs text-slate-600 mb-4 leading-normal">Save the transaction token below. Scan or enter this voucher on your mobile app to claim points.</p>
                  
                  {sessionPoints > 0 ? (
                    <div className="mt-4 bg-[#FAFDFB] border-2 border-dashed border-emerald-200 rounded-xl p-4 flex flex-col items-center shadow-sm animate-[print-ticket_0.5s_cubic-bezier(0.18,0.89,0.32,1.28)_forwards]">
                      <span className="font-sans text-[9px] font-bold tracking-[0.15em] border-b border-dashed border-slate-200 w-full pb-1.5 mb-2.5 text-slate-600">
                        ECO-RECYCLING RECEIPT
                      </span>
                      <div className="font-sans text-2xl font-bold tracking-wider text-emerald-600 mb-2.5">
                        {claimedVouchers[0]?.code}
                      </div>
                      <div className="flex justify-between w-full text-[10px] font-sans border-t border-dashed border-slate-200 pt-1.5 text-slate-600">
                        <span>Points: {sessionPoints}</span>
                        <span>Items: {sessionBottles}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="inline-flex text-[10px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full text-rose-600 bg-rose-50 border border-rose-200 mt-3">
                      No items recycled - ticket voided
                    </div>
                  )}
                </>
              )}

            </div>
          </div>

          {/* MINIMALIST HARDWARE STATUS BAR */}
          <div className="flex flex-wrap justify-around gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2 px-3 mt-6 w-full">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sensor Active
            </span>
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                kioskState === 'result' && currentResult?.isPet ? 'bg-emerald-500' : 'bg-slate-400'
              }`} />
              {kioskState === 'result' && currentResult?.isPet ? 'Gate Open' : 'Gate Closed'}
            </span>
            <span className="text-xs font-bold font-mono text-slate-600 flex items-center gap-1.5">
              Bin: {binOccupancy}%
            </span>
          </div>

        </div>

      </div>

      {/* 2. Middle Row: Left (Claimed Receipts list), Right (Materials Classification Donut Chart) - 50/50 EVEN Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mt-6">
        
        {/* Left Side - Vouchers */}
        <div className="flex flex-col h-[380px]">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col h-full overflow-hidden">
            <h2 className="font-sans text-base font-bold mb-4 flex items-center gap-2 text-slate-900">
              <Sparkles className="w-4.5 h-4.5 text-cyan-600" />
              Claimed Points Receipts
            </h2>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 custom-scrollbar">
              {claimedVouchers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400 text-xs">
                  <Database className="w-8 h-8 opacity-40 mb-2" />
                  <p>No receipts claimed yet. Initiate session and deposit bottles!</p>
                </div>
              ) : (
                claimedVouchers.map((voucher, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-center gap-2">
                        <p className="text-[11px] font-bold font-mono text-cyan-600 m-0">{voucher.code}</p>
                        <span className="text-[9px] text-slate-400">
                          {new Date(voucher.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 m-0 mt-0.5">
                        Accumulated Points: {voucher.points}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleCopyCode(voucher.code)}
                        className="bg-slate-50 border border-slate-200 p-2 rounded-lg cursor-pointer text-slate-500 flex items-center justify-center transition-all duration-200 hover:border-slate-400 hover:text-slate-900 hover:bg-slate-100"
                        title="Copy Receipt Code"
                      >
                        {copyFeedback === voucher.code ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side - Materials Classification */}
        <div className="h-full">
          <MaterialsChart logs={logs} />
        </div>
      </div>

      {/* 3. Bottom Row: Sorting Throughput Area Chart (Spans Whole Screen) */}
      <div className="w-full mt-6">
        <ThroughputChart logs={logs} />
      </div>

    </div>
  );
};
