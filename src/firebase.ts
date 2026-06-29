import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getDatabase, ref, onValue, update } from 'firebase/database';
import type { Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.databaseURL &&
  firebaseConfig.projectId
);

let app;
let firestoreDb: Firestore | null = null;
let realtimeDb: Database | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firestoreDb = getFirestore(app);
    realtimeDb = getDatabase(app);
  } catch (error) {
    console.error('Failed to initialize Firebase SDK:', error);
  }
}

export const isLiveFirebase = isFirebaseConfigured && firestoreDb !== null;

// ==========================================
// MOCK IMPLEMENTATION FOR DEMONSTRATION
// ==========================================

export interface ClassificationLog {
  id: string;
  timestamp: string;
  label: string;
  isPet: boolean;
  confidence: number;
  pointsAdded: number;
  imageUrl: string;
}

export interface WifiVoucher {
  id: string;
  code: string;
  durationMinutes: number;
  pointsCost: number;
  timestamp: string;
  status: 'active' | 'used';
}

export interface SorterState {
  online: boolean;
  state: 'idle' | 'scanning' | 'sorting_pet' | 'rejecting' | 'bin_full';
  bin_occupancy: number;
  last_keep_alive: number;
  active_scan: {
    scan_id: string;
    label: string;
    confidence: number;
    gate_open: boolean;
  } | null;
}

const mockLogsKey = 'ecowifi_mock_logs';
const mockPointsKey = 'ecowifi_mock_points';
const mockVouchersKey = 'ecowifi_mock_vouchers';

const getInitialMockLogs = (): ClassificationLog[] => {
  const saved = localStorage.getItem(mockLogsKey);
  if (saved) return JSON.parse(saved);
  
  const defaultLogs: ClassificationLog[] = [
    {
      id: 'log-1',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      label: 'PET Bottle',
      isPet: true,
      confidence: 0.98,
      pointsAdded: 10,
      imageUrl: 'https://images.unsplash.com/photo-1595278069441-2cf29f8db0d8?w=300&auto=format&fit=crop'
    },
    {
      id: 'log-2',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      label: 'Soda Can (Aluminium)',
      isPet: false,
      confidence: 0.95,
      pointsAdded: 0,
      imageUrl: 'https://images.unsplash.com/photo-1527960656366-ee2a999e32e6?w=300&auto=format&fit=crop'
    }
  ];
  localStorage.setItem(mockLogsKey, JSON.stringify(defaultLogs));
  return defaultLogs;
};

const getInitialMockVouchers = (): WifiVoucher[] => {
  const saved = localStorage.getItem(mockVouchersKey);
  if (saved) return JSON.parse(saved);
  
  const defaultVouchers: WifiVoucher[] = [
    {
      id: 'v-1',
      code: 'WIFI-98A1-ECO',
      durationMinutes: 15,
      pointsCost: 10,
      timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
      status: 'used'
    },
    {
      id: 'v-2',
      code: 'WIFI-32F9-ECO',
      durationMinutes: 90,
      pointsCost: 50,
      timestamp: new Date(Date.now() - 1200000).toISOString(),
      status: 'active'
    }
  ];
  localStorage.setItem(mockVouchersKey, JSON.stringify(defaultVouchers));
  return defaultVouchers;
};

let mockLogs: ClassificationLog[] = getInitialMockLogs();
let mockVouchers: WifiVoucher[] = getInitialMockVouchers();
let mockPoints: number = parseInt(localStorage.getItem(mockPointsKey) || '80', 10);
let mockSorterState: SorterState = {
  online: true,
  state: 'idle',
  bin_occupancy: 12.5,
  last_keep_alive: Date.now(),
  active_scan: null
};

const logListeners = new Set<(logs: ClassificationLog[]) => void>();
const stateListeners = new Set<(state: SorterState) => void>();
const pointsListeners = new Set<(points: number) => void>();
const vouchersListeners = new Set<(vouchers: WifiVoucher[]) => void>();

export const mockFirebase = {
  subscribeLogs: (callback: (logs: ClassificationLog[]) => void) => {
    logListeners.add(callback);
    callback([...mockLogs]);
    return () => { logListeners.delete(callback); };
  },

  subscribeSorterState: (callback: (state: SorterState) => void) => {
    stateListeners.add(callback);
    callback({ ...mockSorterState });
    return () => { stateListeners.delete(callback); };
  },

  subscribePoints: (callback: (points: number) => void) => {
    pointsListeners.add(callback);
    callback(mockPoints);
    return () => { pointsListeners.delete(callback); };
  },

  subscribeVouchers: (callback: (vouchers: WifiVoucher[]) => void) => {
    vouchersListeners.add(callback);
    callback([...mockVouchers]);
    return () => { vouchersListeners.delete(callback); };
  },

  triggerClassification: async (label: string, isPet: boolean, confidence: number, imageUrl: string) => {
    // 1. Update State to Scanning
    mockSorterState = {
      ...mockSorterState,
      state: 'scanning',
      active_scan: {
        scan_id: `scan-${Math.random().toString(36).substr(2, 9)}`,
        label,
        confidence,
        gate_open: false
      }
    };
    stateListeners.forEach(cb => cb({ ...mockSorterState }));

    // Simulate sorting laser processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 2. Open Gate if PET and assign points
    const pointsAdded = isPet ? 10 : 0;
    mockSorterState = {
      ...mockSorterState,
      state: isPet ? 'sorting_pet' : 'rejecting',
      active_scan: {
        ...mockSorterState.active_scan!,
        gate_open: isPet
      }
    };
    stateListeners.forEach(cb => cb({ ...mockSorterState }));

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Add log
    const newLog: ClassificationLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      label,
      isPet,
      confidence,
      pointsAdded,
      imageUrl
    };

    mockLogs = [newLog, ...mockLogs].slice(0, 50);
    localStorage.setItem(mockLogsKey, JSON.stringify(mockLogs));
    logListeners.forEach(cb => cb([...mockLogs]));

    if (pointsAdded > 0) {
      mockPoints += pointsAdded;
      localStorage.setItem(mockPointsKey, mockPoints.toString());
      pointsListeners.forEach(cb => cb(mockPoints));
    }

    const newOccupancy = Math.min(100, mockSorterState.bin_occupancy + (isPet ? 1.5 : 0.5));
    
    // 3. Reset to idle
    mockSorterState = {
      ...mockSorterState,
      state: newOccupancy >= 100 ? 'bin_full' : 'idle',
      bin_occupancy: parseFloat(newOccupancy.toFixed(1)),
      active_scan: null
    };
    stateListeners.forEach(cb => cb({ ...mockSorterState }));
  },

  generateWifiVoucher: (durationMinutes: number, pointsCost: number): boolean => {
    if (mockPoints < pointsCost) return false;

    // Deduct points
    mockPoints -= pointsCost;
    localStorage.setItem(mockPointsKey, mockPoints.toString());
    pointsListeners.forEach(cb => cb(mockPoints));

    // Create Voucher
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'WIFI-';
    for (let i = 0; i < 4; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    code += '-ECO';

    const newVoucher: WifiVoucher = {
      id: `v-${Date.now()}`,
      code,
      durationMinutes,
      pointsCost,
      timestamp: new Date().toISOString(),
      status: 'active'
    };

    mockVouchers = [newVoucher, ...mockVouchers];
    localStorage.setItem(mockVouchersKey, JSON.stringify(mockVouchers));
    vouchersListeners.forEach(cb => cb([...mockVouchers]));
    return true;
  },

  useWifiVoucher: (voucherId: string) => {
    mockVouchers = mockVouchers.map(v => 
      v.id === voucherId ? { ...v, status: 'used' as const } : v
    );
    localStorage.setItem(mockVouchersKey, JSON.stringify(mockVouchers));
    vouchersListeners.forEach(cb => cb([...mockVouchers]));
  },

  resetMockData: () => {
    localStorage.removeItem(mockLogsKey);
    localStorage.removeItem(mockPointsKey);
    localStorage.removeItem(mockVouchersKey);
    mockLogs = getInitialMockLogs();
    mockVouchers = getInitialMockVouchers();
    mockPoints = 80;
    mockSorterState = {
      online: true,
      state: 'idle',
      bin_occupancy: 12.5,
      last_keep_alive: Date.now(),
      active_scan: null
    };
    logListeners.forEach(cb => cb([...mockLogs]));
    vouchersListeners.forEach(cb => cb([...mockVouchers]));
    pointsListeners.forEach(cb => cb(mockPoints));
    stateListeners.forEach(cb => cb({ ...mockSorterState }));
  }
};

export const liveFirebase = {
  subscribeLogs: (callback: (logs: ClassificationLog[]) => void) => {
    if (!firestoreDb) return () => {};
    const q = query(
      collection(firestoreDb, 'classification_logs'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snapshot) => {
      const logs: ClassificationLog[] = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as ClassificationLog);
      });
      callback(logs);
    });
  },

  subscribeSorterState: (deviceId: string, callback: (state: SorterState) => void) => {
    if (!realtimeDb) return () => {};
    const deviceRef = ref(realtimeDb, `devices/${deviceId}`);
    return onValue(deviceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        callback({
          online: data.device_info?.status === 'online',
          state: data.current_scan?.state || 'idle',
          bin_occupancy: data.telemetry?.bin_fill_level || 0,
          last_keep_alive: data.telemetry?.last_updated || Date.now(),
          active_scan: data.current_scan ? {
            scan_id: data.current_scan.scan_id,
            label: data.current_scan.label || '',
            confidence: data.current_scan.confidence || 0,
            gate_open: data.current_scan.gate_open || false
          } : null
        });
      }
    });
  },

  addLog: async (log: Omit<ClassificationLog, 'id'>) => {
    if (!firestoreDb) return;
    await addDoc(collection(firestoreDb, 'classification_logs'), log);
  },

  updateTelemetry: async (deviceId: string, updateData: Record<string, unknown>) => {
    if (!realtimeDb) return;
    const deviceRef = ref(realtimeDb, `devices/${deviceId}`);
    await update(deviceRef, updateData);
  }
};
