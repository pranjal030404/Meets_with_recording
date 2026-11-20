// OpenTelemetry tracing. Load BEFORE the app:   node --import ./src/observability/tracing.mjs src/index.js
// Enabled only when OTEL_EXPORTER_OTLP_ENDPOINT is set (e.g. http://otel-collector:4318); otherwise a no-op.
// Auto-instruments http/express/mysql2/ioredis etc. fs instrumentation is off (very noisy). Service name = OTEL_SERVICE_NAME or meetclone.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'meetclone',
      traceExporter: new OTLPTraceExporter(), // endpoint/headers from the standard OTEL_EXPORTER_OTLP_* env vars
      instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
    });
    sdk.start();
    process.on('SIGTERM', () => { sdk.shutdown().catch(() => {}); });
    console.log('[otel] tracing enabled');
  } catch (e) {
    console.warn(`[otel] tracing not started: ${e.message}`);
  }
}
