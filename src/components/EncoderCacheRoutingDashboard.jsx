// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Encoder Cache-Aware Routing (multimodal) well-lit-path POC.
//
// The multimodal analog of Intelligent Routing: when many requests share an
// image, routing them to the replica with a warm encoder cache turns a
// redundant vision-encode into a cache hit, cutting TTFT. The benefit scales
// with how much image content is shared, so image-reuse rate is the headline
// independent variable this view exposes (Intelligent Routing has no such axis).
//
// Data: checked-in SYNTHETIC v0.2.1 sample reports (see
// tools/gen_sample_encoder_cache_reports.mjs), loaded through the real
// parseReportV02 pipeline. Swap for real runs once they exist.

import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ArrowLeft, Images, AlertTriangle } from 'lucide-react';
import { ChartCard } from './common';
import { loadEncoderCacheReports } from '../utils/encoderCacheReportLoader';

const MODE_META = {
  baseline:    { label: 'Baseline (round-robin)',    color: '#94a3b8' },
  approximate: { label: 'Approximate cache routing', color: '#f59e0b' },
  precise:     { label: 'Precise encoder cache-aware', color: '#22d3ee' },
};
const MODE_ORDER = ['baseline', 'approximate', 'precise'];
const pctLabel = (r) => `${Math.round(r * 100)}%`;

const tooltipStyle = {
  backgroundColor: 'rgba(15,23,42,0.95)',
  border: '1px solid #334155',
  borderRadius: '0.5rem',
  color: '#f1f5f9',
  fontSize: '12px',
};

export default function EncoderCacheRoutingDashboard({ onNavigateBack }) {
  const [points, setPoints] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Controls: which QPS the reuse-sweep charts hold fixed, and which reuse rate
  // the QPS-sweep charts hold fixed.
  const [fixedQps, setFixedQps] = useState(5);
  const [fixedReuse, setFixedReuse] = useState(0.85);

  useEffect(() => {
    loadEncoderCacheReports()
      .then(({ points, meta }) => {
        setPoints(points);
        setMeta(meta);
        if (meta.qpsValues?.length) setFixedQps(meta.qpsValues[Math.min(1, meta.qpsValues.length - 1)]);
        if (meta.reuseRates?.length) setFixedReuse(meta.reuseRates[meta.reuseRates.length - 1]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // TTFT P50 vs image-reuse rate, at the fixed QPS. One series per mode.
  const ttftVsReuse = useMemo(() => {
    if (!meta) return [];
    return meta.reuseRates.map((r) => {
      const row = { reuse: r, reuseLabel: pctLabel(r) };
      for (const mode of MODE_ORDER) {
        const p = points.find((x) => x.mode === mode && x.reuseRate === r && x.qps === fixedQps);
        if (p) row[mode] = p.ttftP50;
      }
      return row;
    });
  }, [points, meta, fixedQps]);

  // TTFT P50 vs QPS, at the fixed reuse rate. One series per mode.
  const ttftVsQps = useMemo(() => {
    if (!meta) return [];
    return meta.qpsValues.map((q) => {
      const row = { qps: q };
      for (const mode of MODE_ORDER) {
        const p = points.find((x) => x.mode === mode && x.reuseRate === fixedReuse && x.qps === q);
        if (p) row[mode] = p.ttftP50;
      }
      return row;
    });
  }, [points, meta, fixedReuse]);

  // ITL P50 vs QPS at fixed reuse — the hot-spotting guard.
  const itlVsQps = useMemo(() => {
    if (!meta) return [];
    return meta.qpsValues.map((q) => {
      const row = { qps: q };
      for (const mode of MODE_ORDER) {
        const p = points.find((x) => x.mode === mode && x.reuseRate === fixedReuse && x.qps === q);
        if (p) row[mode] = p.itlP50;
      }
      return row;
    });
  }, [points, meta, fixedReuse]);

  // Encoder cache hit rate by mode, at fixed reuse + QPS — the causal link.
  const hitByMode = useMemo(() => {
    return MODE_ORDER.map((mode) => {
      const p = points.find((x) => x.mode === mode && x.reuseRate === fixedReuse && x.qps === fixedQps);
      return { mode, label: MODE_META[mode].label, hit: p?.encoderHitRate ?? 0 };
    });
  }, [points, fixedReuse, fixedQps]);

  if (loading) return <Centered>Loading sample reports…</Centered>;
  if (error) return <Centered>Failed to load: {error}</Centered>;

  const modeLines = MODE_ORDER.map((mode) => (
    <Line key={mode} type="monotone" dataKey={mode} name={MODE_META[mode].label}
      stroke={MODE_META[mode].color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
  ));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-20 pb-16 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <button onClick={onNavigateBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyan-600/15 text-cyan-300"><Images className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Encoder Cache-Aware Routing</h1>
            <p className="text-sm text-slate-400">Multimodal well-lit path · Proof of concept</p>
          </div>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded
            bg-amber-500/15 text-amber-300 border border-amber-500/30">Sample data</span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl mb-6">
          When many requests share an image, routing them to the replica with a warm encoder cache
          turns a redundant vision-encode into a cache hit, cutting Time To First Token. The benefit
          scales with how much image content is shared: at low reuse all routing modes converge; at
          high reuse precise encoder cache-aware routing wins.
        </p>

        {meta && (
          <div className="flex flex-wrap items-center gap-4 mb-6 text-xs text-slate-400">
            <span><span className="text-slate-500">Model</span> {meta.model}</span>
            <span><span className="text-slate-500">Hardware</span> {meta.hardware}</span>
            <Control label="Fixed QPS" value={fixedQps} onChange={setFixedQps} options={meta.qpsValues} />
            <Control label="Fixed reuse" value={fixedReuse} onChange={setFixedReuse}
              options={meta.reuseRates} fmt={pctLabel} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title={`TTFT (P50) vs image-reuse rate — at ${fixedQps} QPS`}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={ttftVsReuse} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="reuseLabel" stroke="#64748b" fontSize={12}
                  label={{ value: 'Image reuse rate', position: 'insideBottom', offset: -4, fill: '#64748b', fontSize: 11 }} />
                <YAxis stroke="#64748b" fontSize={12} unit="ms" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Math.round(v)} ms`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {modeLines}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Encoder cache hit rate by mode — at ${fixedQps} QPS, ${pctLabel(fixedReuse)} reuse`}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hitByMode} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="mode" stroke="#64748b" fontSize={11}
                  tickFormatter={(m) => (m === 'precise' ? 'precise' : m === 'approximate' ? 'approx' : 'baseline')} />
                <YAxis stroke="#64748b" fontSize={12} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Math.round(v)}%`}
                  labelFormatter={(m) => MODE_META[m]?.label || m} />
                <Bar dataKey="hit" name="Encoder cache hit rate" radius={[4, 4, 0, 0]}>
                  {hitByMode.map((d) => <Cell key={d.mode} fill={MODE_META[d.mode].color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`TTFT (P50) vs QPS — at ${pctLabel(fixedReuse)} image reuse`}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={ttftVsQps} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="qps" stroke="#64748b" fontSize={12} unit=" qps" />
                <YAxis stroke="#64748b" fontSize={12} unit="ms" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Math.round(v)} ms`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {modeLines}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Inter-token latency (P50) vs QPS — at ${pctLabel(fixedReuse)} reuse (hot-spotting guard)`}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={itlVsQps} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="qps" stroke="#64748b" fontSize={12} unit=" qps" />
                <YAxis stroke="#64748b" fontSize={12} unit="ms" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v.toFixed(1)} ms`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {modeLines}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="mt-8 flex items-start gap-3 text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-slate-300 font-medium mb-1">How this is wired (POC)</p>
            Charts render from checked-in synthetic v0.2.1 reports
            (<code className="text-cyan-400">public/data/encoder-cache-routing/</code>), loaded through the
            same <code className="text-cyan-400">parseReportV02</code> pipeline the upload path uses. The
            three multimodal fields the v0.2 parser does not yet read are the proposed v0.2.1 additions:
            <code className="text-cyan-400"> scenario.routing.standardized.mode</code>,
            <code className="text-cyan-400"> scenario.load.standardized.media</code> (reuse / pool), and
            <code className="text-cyan-400"> results.observability.encoder_cache_hit_rate</code>. Swap the
            sample file for real runs to go live.
          </div>
        </div>
      </div>
    </div>
  );
}

function Control({ label, value, onChange, options, fmt }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
      >
        {options.map((o) => <option key={o} value={o}>{fmt ? fmt(o) : o}</option>)}
      </select>
    </span>
  );
}

function Centered({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center pt-16">
      {children}
    </div>
  );
}
