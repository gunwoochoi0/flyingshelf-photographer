
import { parentPort } from 'worker_threads';
import { renderCanvasServerSide, CanvasVersionSnapshot } from '../index';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.');
}

const pp = parentPort;

pp.on('message', async (task) => {
  const { versionData, dimensions, fonts, outputFormat, jpegQuality, id } = task;
  try {
    const imageBuffer = await renderCanvasServerSide(versionData, dimensions, fonts, 2, outputFormat, jpegQuality);
    pp.postMessage({ id, result: imageBuffer });
  } catch (error) {
    // If error is an instance of Error, we can post its message and stack.
    // Otherwise, we post the error as is.
    const err = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    pp.postMessage({ id, error: err });
  }
});
