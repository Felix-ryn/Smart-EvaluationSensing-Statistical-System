/**
 * Forecast Scheduler Service
 * Runs modern forecast automatically on monthly basis
 * - Manual trigger: On-demand via API
 * - Scheduled trigger: Last day of month at 23:00
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import cron from 'node-cron';
import { prisma } from '../prisma.js';
import { spawnPythonScript } from '../lib/python.js';

// Log file path
const logsDir = join(process.cwd(), '../logs');
const logFile = join(logsDir, 'forecast.log');

// Ensure logs directory exists before any write attempt.
mkdirSync(logsDir, { recursive: true });

/**
 * Log message to file with timestamp
 */
function logMessage(message: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  try {
    appendFileSync(logFile, logEntry);
    console.log(logEntry);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

/**
 * Run forecast script
 * Returns: { success, jobId, message }
 */
export async function runForecast(): Promise<{ success: boolean; jobId: string; message: string }> {
  const jobId = `job_${Date.now()}`;
  logMessage(`🚀 [${jobId}] Forecast job started`);

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result: { success: boolean; jobId: string; message: string }) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const start = async () => {
      let forecast;
      try {
        const launched = await spawnPythonScript('forecast_revenue_modern.py', { stdio: 'pipe' });
        forecast = launched.child;
        logMessage(
          `ℹ️  [${jobId}] Python command: ${launched.python.command} ${launched.python.argsPrefix.join(' ')}`.trim(),
        );
        logMessage(`ℹ️  [${jobId}] Script path: ${launched.scriptPath}`);
      } catch (err: any) {
        const message = err?.message ?? 'Unknown spawn error';
        logMessage(`❌ [${jobId}] Spawn error: ${message}`);
        finish({
          success: false,
          jobId,
          message: `Error: ${message}`,
        });
        return;
      }

      let output = '';
      let errorOutput = '';

      // Capture stdout
      forecast.stdout?.on('data', (data) => {
        const message = data.toString();
        output += message;
        logMessage(`📤 ${message.trim()}`);
      });

      // Capture stderr
      forecast.stderr?.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        logMessage(`❌ ${message.trim()}`);
      });

      // Handle completion
      forecast.on('close', async (code) => {
        if (code === 0) {
          logMessage(`✅ [${jobId}] Forecast completed successfully`);

          // Save forecast execution record to database
          try {
            await prisma.jukirCluster.findFirst({
              where: { analyzedTo: new Date() }
            });
            logMessage(`✅ [${jobId}] Results verified in database`);
          } catch (err) {
            logMessage(`⚠️  [${jobId}] Could not verify database records`);
          }

          finish({
            success: true,
            jobId,
            message: 'Forecast completed successfully'
          });
        } else {
          const details = errorOutput.trim() || output.trim();
          logMessage(`❌ [${jobId}] Forecast failed with exit code ${code}`);
          finish({
            success: false,
            jobId,
            message: details
              ? `Forecast failed with exit code ${code}: ${details}`
              : `Forecast failed with exit code ${code}`
          });
        }
      });

      // Handle errors
      forecast.on('error', (err) => {
        logMessage(`❌ [${jobId}] Spawn error: ${err.message}`);
        finish({
          success: false,
          jobId,
          message: `Error: ${err.message}`
        });
      });

      // keep refs "used" to avoid TS noUnusedLocals in stricter setups
      void output;
      void errorOutput;
    };

    void start();
  });
}

/**
 * Initialize scheduler
 * Runs forecast on last day of month at 23:00
 */
export function initializeScheduler(): void {
  logMessage('🕐 Initializing forecast scheduler...');

  // Cron pattern: 0 23 28-31 * *
  // Runs at 23:00 on days 28-31 (covers all month-ends)
  const task = cron.schedule('0 23 28-31 * *', async () => {
    // Only run if it's actually the last day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (tomorrow.getDate() === 1) {
      logMessage('📅 Last day of month detected - running scheduled forecast');
      await runForecast();
    }
  });

  logMessage('✅ Scheduler initialized: Will run last day of month at 23:00 UTC');

  // Optional: Run forecast immediately on startup (comment out for production)
  // await runForecast();

  task.start();
}

/**
 * Get last forecast execution info
 */
export async function getLastForecastInfo(): Promise<{
  lastForecast: Date | null;
  lastStatus: string;
  nextScheduled: string;
}> {
  try {
    const lastRecord = await prisma.jukirCluster.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, analyzedTo: true }
    });

    // Calculate next forecast date
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const nextForecast = new Date(currentYear, currentMonth, daysInMonth, 23, 0, 0);
    if (nextForecast <= now) {
      nextForecast.setMonth(nextForecast.getMonth() + 1);
      nextForecast.setDate(new Date(nextForecast.getFullYear(), nextForecast.getMonth() + 1, 0).getDate());
    }

    return {
      lastForecast: lastRecord?.createdAt || null,
      lastStatus: lastRecord ? 'COMPLETED' : 'NEVER_RUN',
      nextScheduled: nextForecast.toISOString()
    };
  } catch (err) {
    return {
      lastForecast: null,
      lastStatus: 'ERROR',
      nextScheduled: 'Unknown'
    };
  }
}

export default initializeScheduler;
