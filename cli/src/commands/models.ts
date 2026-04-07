import { Command } from 'commander';

const DEFAULT_PROVER = process.env.OBELYSK_PROVER_URL || 'http://localhost:8080';

export const modelsCommand = new Command('models')
  .description('List available models on the prover')
  .option('--prover-url <url>', 'Prover server URL', DEFAULT_PROVER)
  .action(async (opts: any) => {
    const fetch = (await import('node-fetch')).default;
    const url = opts.proverUrl;

    const headers: Record<string, string> = {};
    const apiKey = process.env.OBELYSK_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      const resp = await fetch(`${url}/api/v1/models`, { headers });
      if (!resp.ok) {
        console.error(`Error ${resp.status}: ${await resp.text()}`);
        process.exit(1);
      }

      const models = await resp.json() as any[];
      if (!models || models.length === 0) {
        console.log('No models loaded. Load a model with prove-server --model-dir <path>');
        return;
      }

      console.log(`\n${'Model ID'.padEnd(20)} ${'Name'.padEnd(25)} ${'Layers'.padEnd(8)} ${'Weights'.padEnd(8)} Status`);
      console.log('-'.repeat(80));
      for (const m of models) {
        const id = (m.model_id || m.id || '').slice(0, 18);
        const name = (m.name || m.description || 'unknown').slice(0, 23);
        const layers = String(m.num_layers || m.layers || '-');
        const weights = String(m.num_weights || m.weights || '-');
        const status = m.status || 'ready';
        console.log(`${id.padEnd(20)} ${name.padEnd(25)} ${layers.padEnd(8)} ${weights.padEnd(8)} ${status}`);
      }
      console.log(`\n${models.length} model(s) loaded`);
    } catch (e: any) {
      console.error(`Failed to connect to prover at ${url}: ${e.message}`);
      process.exit(1);
    }
  });
