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

// Loader for the Encoder Cache-Aware Routing (multimodal) POC.
//
// Reads the checked-in sample v0.2.1 benchmark reports and flattens each into a
// point the dashboard charts can plot. It deliberately routes the standard
// latency/throughput fields through the SAME parser the upload path uses
// (parseReportV02), so this view exercises the real ingestion pipeline rather
// than a bespoke format. The three multimodal fields the v0.2 parser does not
// yet know about (routing mode, image-reuse config, encoder cache hit rate) are
// read straight off the raw document — these are the proposed v0.2.1 additions.

import yaml from 'js-yaml';
import { parseReportV02 } from './benchmarkReportV02Parser';

const SAMPLE_URL = '/data/encoder-cache-routing/sample_reports_v0_2_1.json';

// Normalize a 0-1 fraction (or already-0-100 value) to a percentage.
const toPct = (v) => (v == null ? null : v <= 1 ? v * 100 : v);

/**
 * Fetch + parse the sample reports.
 *
 * Returns { points, meta } where each point is:
 *   { mode, reuseRate, poolSize, sampling, qps,
 *     ttftP50, ttftP99, itlP50, outputTokenRate, inputTokenRate, encoderHitRate }
 */
export async function loadEncoderCacheReports() {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error(`Failed to load sample reports: ${res.status}`);
  const docs = await res.json();

  const points = [];
  for (const doc of docs) {
    // Standard fields via the real parser (it accepts JSON, a YAML subset).
    const stage = parseReportV02(yaml.dump(doc), doc.run?.uid || 'sample');
    if (!stage) continue;

    // Proposed v0.2.1 extensions, read from the raw doc.
    const media = doc.scenario?.load?.standardized?.media || {};
    const mode = doc.scenario?.routing?.standardized?.mode || 'unknown';
    const encHit = doc.results?.observability?.encoder_cache_hit_rate?.aggregated?.mean;

    points.push({
      mode,
      reuseRate: media.reuse_rate ?? null,
      poolSize: media.pool_size ?? null,
      sampling: media.sampling ?? null,
      qps: stage.scenario.rateQps,
      ttftP50: stage.performance.ttftP50,
      ttftP99: stage.performance.ttftP99,
      itlP50: stage.performance.itlP50,
      outputTokenRate: stage.performance.outputTokenRate,
      inputTokenRate: stage.performance.inputTokenRate,
      encoderHitRate: toPct(encHit),
    });
  }

  return {
    points,
    meta: {
      model: points.length ? docs[0].scenario?.stack?.[0]?.standardized?.model?.name : null,
      hardware: points.length ? docs[0].scenario?.stack?.[0]?.standardized?.accelerator?.model : null,
      modes: [...new Set(points.map((p) => p.mode))],
      reuseRates: [...new Set(points.map((p) => p.reuseRate))].sort((a, b) => a - b),
      qpsValues: [...new Set(points.map((p) => p.qps))].sort((a, b) => a - b),
    },
  };
}
