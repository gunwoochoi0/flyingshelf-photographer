
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';

const a = os.cpus();
const numCPUs = os.cpus().length;
const workerPath = path.resolve(__dirname, 'render-worker.js');

interface Task {
  id: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: any[] = [];
  private activeTasks: Map<string, Task> = new Map();
  private nextTaskId = 0;

  constructor(size = numCPUs) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerPath);
      worker.on('message', (message) => this.onMessage(worker, message));
      worker.on('error', (err) => this.onError(worker, err));
      worker.on('exit', (code) => this.onExit(worker, code));
      this.workers.push(worker);
    }
  }

  private onMessage(worker: Worker, message: { id: string, result?: any, error?: any }) {
    const task = this.activeTasks.get(message.id);
    if (task) {
      if (message.error) {
        task.reject(message.error);
      } else {
        // Data from worker comes back as a Uint8Array, so we convert it back to a Buffer
        task.resolve(Buffer.from(message.result));
      }
      this.activeTasks.delete(message.id);
      this.checkQueue();
    }
  }

  private onError(worker: Worker, err: Error) {
    console.error(`Worker error: ${err.message}`, err);
    // For simplicity, we just log the error. A more robust implementation
    // might try to restart the worker or handle outstanding tasks.
  }

  private onExit(worker: Worker, code: number) {
    if (code !== 0) {
      console.error(`Worker stopped with exit code ${code}`);
    }
    // Remove worker from the pool and maybe create a new one.
    this.workers = this.workers.filter(w => w !== worker);
  }
  
  private checkQueue() {
    // This simple pool doesn't re-assign workers, it just runs one task per worker at a time.
    // A more complex pool would manage a queue and dispatch to idle workers.
  }

  run(taskData: any) {
    return new Promise((resolve, reject) => {
      // In this simple round-robin implementation, we just pick the next worker.
      // A better implementation would find a truly idle worker.
      const workerIndex = this.nextTaskId % this.workers.length;
      const worker = this.workers[workerIndex];

      const id = `${this.nextTaskId++}`;
      this.activeTasks.set(id, { id, resolve, reject });

      worker.postMessage({ ...taskData, id });
    });
  }

  async destroy() {
    for (const worker of this.workers) {
      await worker.terminate();
    }
  }
}

export const renderWorkerPool = new WorkerPool();
