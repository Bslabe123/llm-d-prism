# Encoder Cache-Aware Routing (multimodal) — POC sample data

`sample_reports_v0_2_1.json` is an array of **synthetic, deterministic**
llm-d-benchmark Benchmark Report v0.2.1 documents used to drive the
**Encoder Cache-Aware Routing** well-lit-path proof of concept
(`src/components/EncoderCacheRoutingDashboard.jsx`).

These are **not real runs.** They exist so the Prism view can render the
end-to-end flow (report → `parseReportV02` → charts) before real multimodal
benchmarks land. Regenerate with:

```
node tools/gen_sample_encoder_cache_reports.mjs
```

## Proposed v0.2.1 additions exercised here

The standard v0.2 latency/throughput/observability fields parse through the
existing `parseReportV02` unchanged. Three fields are **proposed v0.2.1
additions** that the multimodal guide needs; the view reads them off the raw
document:

| Field | Purpose |
| --- | --- |
| `scenario.routing.standardized.mode` | `baseline` / `approximate` / `precise` routing mode |
| `scenario.load.standardized.media` | image-reuse config: `pool_size`, `sampling`, `zipf_s`, `reuse_rate`, `image_tokens_per_request` |
| `results.observability.encoder_cache_hit_rate` | scraped vLLM/EPP encoder cache hit rate (explanatory metric) |

Note: `encoder_cache_hit_rate` rides the existing open `observability` map, so
it is **not** a structural schema change — it is one more scraped Prometheus
metric. The headline metric (TTFT) and the x-axis (image-reuse rate, a workload
input) need neither a new field nor a measured hit rate.

## Reproduce the flow locally

```
git checkout poc/encoder-cache-routing
npm ci
npm run dev          # then open the Encoder Cache Routing well-lit path
```
