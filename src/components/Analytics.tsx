import React, { useMemo, useState, useEffect } from 'react';
import type { ClassificationLog } from '../firebase';
import { BarChart3, TrendingUp } from 'lucide-react';

interface ChartProps {
  logs: ClassificationLog[];
}

const SVG_DIMENSIONS = { width: 1000, height: 240, padding: 40 };

// 1. Throughput Area Chart Component
export const ThroughputChart: React.FC<ChartProps> = ({ logs }) => {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Generate data points for the real-time Area Chart (6 10-minute intervals)
  const chartData = useMemo(() => {
    if (now === 0) return [];
    const bucketSize = 10 * 60 * 1000; // 10 minute buckets
    const buckets = Array.from({ length: 6 }).map((_, i) => {
      const end = now - i * bucketSize;
      const start = end - bucketSize;
      return {
        label: new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        start,
        end,
        count: 0,
      };
    }).reverse();

    logs.forEach(log => {
      const logTime = new Date(log.timestamp).getTime();
      const bucket = buckets.find(b => logTime >= b.start && logTime < b.end);
      if (bucket) {
        bucket.count++;
      }
    });

    return buckets;
  }, [logs, now]);

  // SVG Area Chart drawing logic
  const chartPoints = useMemo(() => {
    const { width, height, padding } = SVG_DIMENSIONS;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxCount = Math.max(...chartData.map(d => d.count), 4);

    const points = chartData.map((d, index) => {
      const x = padding + (index / (chartData.length - 1)) * chartWidth;
      const y = padding + chartHeight - (d.count / maxCount) * chartHeight;
      return { x, y, value: d.count, label: d.label };
    });

    if (points.length === 0) return { path: '', areaPath: '', points: [] };

    const linePath = points.reduce((acc, p, idx) => {
      return acc + `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    }, '');

    const areaPath = linePath + 
      ` L ${points[points.length - 1].x} ${height - padding}` + 
      ` L ${points[0].x} ${height - padding} Z`;

    return { linePath, areaPath, points };
  }, [chartData]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden w-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-200 text-emerald-600">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-sans font-bold text-sm text-slate-900">Sorting Throughput</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Items sorted in 10-minute intervals</p>
          </div>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-600 animate-pulse">
          Live Stream
        </span>
      </div>

      {/* Custom SVG Line/Area Chart */}
      <div className="w-full flex justify-center py-2">
        <svg 
          viewBox={`0 0 ${SVG_DIMENSIONS.width} ${SVG_DIMENSIONS.height}`} 
          className="w-full h-auto overflow-visible"
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          <line 
            x1={SVG_DIMENSIONS.padding} 
            y1={SVG_DIMENSIONS.padding} 
            x2={SVG_DIMENSIONS.width - SVG_DIMENSIONS.padding} 
            y2={SVG_DIMENSIONS.padding} 
            stroke="#F1F5F9"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line 
            x1={SVG_DIMENSIONS.padding} 
            y1={(SVG_DIMENSIONS.height) / 2} 
            x2={SVG_DIMENSIONS.width - SVG_DIMENSIONS.padding} 
            y2={(SVG_DIMENSIONS.height) / 2} 
            stroke="#F1F5F9"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line 
            x1={SVG_DIMENSIONS.padding} 
            y1={SVG_DIMENSIONS.height - SVG_DIMENSIONS.padding} 
            x2={SVG_DIMENSIONS.width - SVG_DIMENSIONS.padding} 
            y2={SVG_DIMENSIONS.height - SVG_DIMENSIONS.padding} 
            stroke="#E2E8F0" 
            strokeWidth="1.5"
          />

          {/* Filled Area */}
          {chartPoints.areaPath && (
            <path d={chartPoints.areaPath} fill="url(#areaGradient)" />
          )}

          {/* Glowing Line */}
          {chartPoints.linePath && (
            <path 
              d={chartPoints.linePath} 
              fill="none" 
              stroke="#059669" 
              strokeWidth="3" 
              strokeLinecap="round" 
              style={{ filter: 'drop-shadow(0 2px 4px rgba(16, 185, 129, 0.2))' }}
            />
          )}

          {/* Data Nodes & Labels */}
          {chartPoints.points.map((p, i) => (
            <g key={i} className="group cursor-pointer">
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="4" 
                fill="white" 
                stroke="#059669" 
                strokeWidth="1.5" 
                className="transition-[r] duration-200 ease hover:r-[6px]"
              />
              
              {/* Tooltip on Hover */}
              <rect 
                x={p.x - 18} 
                y={p.y - 25} 
                width="36" 
                height="16" 
                rx="4" 
                fill="#0F172A" 
                stroke="#1E293B" 
                strokeWidth="1" 
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200" 
              />
              <text 
                x={p.x} 
                y={p.y - 14} 
                textAnchor="middle" 
                fill="white" 
                fontSize="9" 
                fontWeight="700" 
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                {p.value}
              </text>

              {/* X-axis Labels */}
              <text 
                x={p.x} 
                y={SVG_DIMENSIONS.height - 15} 
                textAnchor="middle" 
                fill="#94A3B8" 
                fontSize="10"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

// 2. Materials Classification (Donut Chart) Component
export const MaterialsChart: React.FC<ChartProps> = ({ logs }) => {
  // Calculate materials distribution
  const distribution = useMemo(() => {
    const counts = {
      pet: 0,
      can: 0,
      glass: 0,
      other: 0,
    };
    
    logs.forEach(log => {
      const label = log.label.toLowerCase();
      if (label.includes('pet') || label.includes('bottle') && log.isPet) {
        counts.pet++;
      } else if (label.includes('can') || label.includes('aluminium') || label.includes('soda')) {
        counts.can++;
      } else if (label.includes('glass')) {
        counts.glass++;
      } else {
        counts.other++;
      }
    });

    const total = logs.length || 1;
    
    return [
      { name: 'PET Bottles', count: counts.pet, color: '#10B981', pct: (counts.pet / total) * 100 },
      { name: 'Aluminium Cans', count: counts.can, color: '#3B82F6', pct: (counts.can / total) * 100 },
      { name: 'Glass Bottles', count: counts.glass, color: '#F59E0B', pct: (counts.glass / total) * 100 },
      { name: 'Other Plastics', count: counts.other, color: '#6B7280', pct: (counts.other / total) * 100 },
    ];
  }, [logs]);

  // Donut chart path drawing logic
  const donutPaths = useMemo(() => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    
    let accumulatedPercentage = 0;
    
    return distribution.map(item => {
      const strokeDasharray = `${(item.pct / 100) * circumference} ${circumference}`;
      const strokeDashoffset = `${-((accumulatedPercentage / 100) * circumference)}`;
      accumulatedPercentage += item.pct;
      return {
        ...item,
        strokeDasharray,
        strokeDashoffset,
        radius,
      };
    });
  }, [distribution]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden w-full h-[380px] flex flex-col justify-between">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl flex items-center justify-center bg-blue-50 border border-blue-200 text-blue-600">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-sans font-bold text-sm text-slate-900">Materials Classification</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Proportion of scanned items by waste category</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
        {/* SVG Donut */}
        <div className="relative w-[120px] h-[120px] flex items-center justify-center flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r="45" fill="none" stroke="#F1F5F9" strokeWidth="16" />
            {donutPaths.map((item, idx) => (
              <circle
                key={idx}
                cx="60"
                cy="60"
                r={item.radius}
                fill="none"
                stroke={item.color}
                strokeWidth="16"
                strokeDasharray={item.strokeDasharray}
                strokeDashoffset={item.strokeDashoffset}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-500 ease"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total</span>
            <span className="text-slate-900 text-2xl font-bold font-sans">{logs.length}</span>
          </div>
        </div>

        {/* Legend Details */}
        <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {distribution.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 p-2 px-3 bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
              <span 
                className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" 
                style={{ backgroundColor: item.color }} 
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-950 truncate m-0">{item.name}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xs font-bold text-slate-900 font-sans">{item.count}</span>
                  <span className="text-[10px] text-slate-500">({item.pct.toFixed(0)}%)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
