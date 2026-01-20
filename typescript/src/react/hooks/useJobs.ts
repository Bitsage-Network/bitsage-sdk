/**
 * Job Hooks
 * React hooks for job operations
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  SubmitJobRequest,
  SubmitJobResponse,
  JobStatusResponse,
  JobResult,
  ListJobsParams,
  ListJobsResponse,
  JobStatus,
} from '../../types';

/**
 * Mutation state for async operations
 */
interface MutationState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Query state for data fetching
 */
interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to submit a job
 *
 * @example
 * ```tsx
 * function SubmitJobForm() {
 *   const { submit, isLoading, data, error } = useSubmitJob();
 *
 *   const handleSubmit = async () => {
 *     await submit({
 *       job_type: { type: 'ai_inference', model_type: 'llama-7b', batch_size: 1 },
 *       input_data: btoa('Hello!'),
 *       max_cost_sage: 100n,
 *       max_duration_secs: 3600,
 *       priority: 5,
 *       require_tee: false,
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleSubmit} disabled={isLoading}>
 *         {isLoading ? 'Submitting...' : 'Submit Job'}
 *       </button>
 *       {data && <p>Job ID: {data.job_id}</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSubmitJob(): MutationState<SubmitJobResponse> & {
  submit: (request: SubmitJobRequest) => Promise<SubmitJobResponse>;
  reset: () => void;
} {
  const { client } = useBitSage();
  const [state, setState] = useState<MutationState<SubmitJobResponse>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const submit = useCallback(
    async (request: SubmitJobRequest): Promise<SubmitJobResponse> => {
      setState({ data: null, isLoading: true, error: null });

      try {
        const response = await client.submitJob(request);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to submit job');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [client]
  );

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return { ...state, submit, reset };
}

/**
 * Hook to get job status
 *
 * @param jobId - Job ID to query
 * @param options - Query options
 *
 * @example
 * ```tsx
 * function JobStatus({ jobId }: { jobId: string }) {
 *   const { data, isLoading, error, refetch } = useJobStatus(jobId);
 *
 *   if (isLoading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error.message}</p>;
 *   if (!data) return <p>No job found</p>;
 *
 *   return (
 *     <div>
 *       <p>Status: {data.status}</p>
 *       <p>Worker: {data.worker_id || 'Pending'}</p>
 *       <button onClick={refetch}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useJobStatus(
  jobId: string | undefined,
  options?: {
    /** Polling interval in ms (0 to disable) */
    pollingInterval?: number;
    /** Whether to start fetching immediately */
    enabled?: boolean;
  }
): QueryState<JobStatusResponse> {
  const { client } = useBitSage();
  const [state, setState] = useState<QueryState<JobStatusResponse>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const { pollingInterval = 0, enabled = true } = options || {};
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetch = useCallback(async () => {
    if (!jobId) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await client.getJobStatus(jobId);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch job status');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [client, jobId]);

  // Initial fetch
  useEffect(() => {
    if (enabled && jobId) {
      fetch();
    }
  }, [enabled, jobId, fetch]);

  // Polling
  useEffect(() => {
    if (pollingInterval > 0 && enabled && jobId) {
      intervalRef.current = setInterval(fetch, pollingInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pollingInterval, enabled, jobId, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to list jobs
 *
 * @param params - List parameters
 *
 * @example
 * ```tsx
 * function JobList() {
 *   const { data, isLoading, refetch } = useJobs({
 *     status: 'completed',
 *     limit: 10,
 *   });
 *
 *   if (isLoading) return <p>Loading...</p>;
 *
 *   return (
 *     <ul>
 *       {data?.jobs.map((job) => (
 *         <li key={job.job_id}>{job.job_id} - {job.status}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useJobs(params?: ListJobsParams): QueryState<ListJobsResponse> {
  const { client } = useBitSage();
  const [state, setState] = useState<QueryState<ListJobsResponse>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await client.listJobs(params);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to list jobs');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [client, params]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to wait for job completion
 *
 * @param jobId - Job ID to wait for
 * @param options - Wait options
 *
 * @example
 * ```tsx
 * function JobWaiter({ jobId }: { jobId: string }) {
 *   const { result, isWaiting, error, start, cancel } = useWaitForJob(jobId);
 *
 *   return (
 *     <div>
 *       {isWaiting ? (
 *         <button onClick={cancel}>Cancel</button>
 *       ) : (
 *         <button onClick={start}>Start Waiting</button>
 *       )}
 *       {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useWaitForJob(
  jobId: string | undefined,
  options?: {
    /** Polling interval in ms */
    pollInterval?: number;
    /** Timeout in ms */
    timeout?: number;
    /** Auto-start waiting */
    autoStart?: boolean;
  }
): {
  result: JobResult | null;
  status: JobStatus | null;
  isWaiting: boolean;
  error: Error | null;
  start: () => void;
  cancel: () => void;
} {
  const { client } = useBitSage();
  const [result, setResult] = useState<JobResult | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { pollInterval = 2000, timeout = 300000, autoStart = false } = options || {};
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    if (!jobId || isWaiting) return;

    setIsWaiting(true);
    setError(null);
    setResult(null);

    abortRef.current = new AbortController();

    const poll = async () => {
      const startTime = Date.now();

      while (!abortRef.current?.signal.aborted) {
        try {
          const jobStatus = await client.getJobStatus(jobId);
          setStatus(jobStatus.status);

          if (jobStatus.status === 'completed') {
            const jobResult = await client.getJobResult(jobId);
            setResult(jobResult);
            setIsWaiting(false);
            return;
          }

          if (jobStatus.status === 'failed') {
            throw new Error('Job failed');
          }

          if (jobStatus.status === 'cancelled') {
            throw new Error('Job was cancelled');
          }

          // Check timeout
          if (Date.now() - startTime > timeout) {
            throw new Error('Timeout waiting for job completion');
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } catch (err) {
          if (!abortRef.current?.signal.aborted) {
            setError(err instanceof Error ? err : new Error('Wait failed'));
            setIsWaiting(false);
          }
          return;
        }
      }
    };

    poll();
  }, [client, jobId, isWaiting, pollInterval, timeout]);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsWaiting(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Auto-start
  useEffect(() => {
    if (autoStart && jobId) {
      start();
    }
  }, [autoStart, jobId, start]);

  return { result, status, isWaiting, error, start, cancel };
}

/**
 * Hook to cancel a job
 *
 * @example
 * ```tsx
 * function CancelButton({ jobId }: { jobId: string }) {
 *   const { cancel, isLoading, error } = useCancelJob();
 *
 *   return (
 *     <button onClick={() => cancel(jobId)} disabled={isLoading}>
 *       {isLoading ? 'Cancelling...' : 'Cancel Job'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useCancelJob(): MutationState<void> & {
  cancel: (jobId: string) => Promise<void>;
} {
  const { client } = useBitSage();
  const [state, setState] = useState<MutationState<void>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const cancel = useCallback(
    async (jobId: string): Promise<void> => {
      setState({ data: null, isLoading: true, error: null });

      try {
        await client.cancelJob(jobId);
        setState({ data: undefined as any, isLoading: false, error: null });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to cancel job');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [client]
  );

  return { ...state, cancel };
}

/**
 * Hook to get job result
 *
 * @param jobId - Job ID to get result for
 *
 * @example
 * ```tsx
 * function JobResult({ jobId }: { jobId: string }) {
 *   const { data, isLoading, error } = useJobResult(jobId);
 *
 *   if (isLoading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error.message}</p>;
 *   if (!data) return <p>No result yet</p>;
 *
 *   return <pre>{atob(data.output_data)}</pre>;
 * }
 * ```
 */
export function useJobResult(jobId: string | undefined): QueryState<JobResult> {
  const { client } = useBitSage();
  const [state, setState] = useState<QueryState<JobResult>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!jobId) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await client.getJobResult(jobId);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch job result');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [client, jobId]);

  useEffect(() => {
    if (jobId) {
      fetch();
    }
  }, [jobId, fetch]);

  return { ...state, refetch: fetch };
}
