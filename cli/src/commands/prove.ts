import { Command } from 'commander';

const DEFAULT_PROVER = process.env.OBELYSK_PROVER_URL || 'http://localhost:8080';

export const proveCommand = new Command('prove')
  .description('Prove ML model inference and generate a recursive STARK proof')
  .argument('<model>', 'Model name or ID (e.g. smollm2-135m)')
  .option('--input <json>', 'Input tensor as JSON array (e.g. "[1.0, 2.0, 3.0]")')
  .option('--input-file <path>', 'Read input from JSON file')
  .option('--gpu', 'Use GPU acceleration', true)
  .option('--on-chain', 'Submit proof to Starknet after proving', false)
  .option('--recursive', 'Use recursive STARK compression', true)
  .option('--prover-url <url>', 'Prover server URL', DEFAULT_PROVER)
  .option('--output <path>', 'Save proof to file')
  .option('--quiet', 'Suppress progress output', false)
  .action(async (model: string, opts: any) => {
    const fetch = (await import('node-fetch')).default;
    const fs = await import('fs');

    const url = opts.proverUrl;
    let input: number[] = [1.0, 2.0, 3.0];

    if (opts.input) {
      input = JSON.parse(opts.input);
    } else if (opts.inputFile) {
      input = JSON.parse(fs.readFileSync(opts.inputFile, 'utf-8'));
    }

    if (!opts.quiet) {
      console.log(`Proving model: ${model}`);
      console.log(`Prover: ${url}`);
      console.log(`Input: ${input.length} values`);
      console.log(`GPU: ${opts.gpu}, Recursive: ${opts.recursive}, On-chain: ${opts.onChain}`);
    }

    const endpoint = opts.onChain ? '/api/v1/attest' : '/api/v1/prove';
    const body = {
      model_id: model,
      input,
      gpu: opts.gpu,
      ...(opts.onChain ? { submit_onchain: true, recursive: opts.recursive } : {}),
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.OBELYSK_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      const resp = await fetch(`${url}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        console.error(`Error ${resp.status}: ${await resp.text()}`);
        process.exit(1);
      }

      const result = await resp.json() as any;

      if (opts.output) {
        fs.writeFileSync(opts.output, JSON.stringify(result, null, 2));
        if (!opts.quiet) console.log(`Proof saved to: ${opts.output}`);
      }

      if (!opts.quiet) {
        console.log('\n=== Proof Result ===');
        if (result.proof_id) console.log(`Proof ID:      ${result.proof_id}`);
        if (result.io_commitment) console.log(`IO Commitment: ${result.io_commitment}`);
        if (result.prove_time_ms) console.log(`Prove time:    ${result.prove_time_ms}ms`);
        if (result.calldata_felts) console.log(`Calldata:      ${result.calldata_felts} felts`);
        if (result.tx_hash) console.log(`TX Hash:       ${result.tx_hash}`);
        if (result.job_id) console.log(`Job ID:        ${result.job_id} (polling...)`);
      }
    } catch (e: any) {
      console.error(`Failed to connect to prover at ${url}: ${e.message}`);
      process.exit(1);
    }
  });
