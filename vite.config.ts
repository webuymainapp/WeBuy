import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Start the local mail worker alongside the dev server so "ready to send"
 * emails in the mail_queue outbox are drained via Gmail SMTP the moment
 * `npm run dev` starts. Disable with DISABLE_MAIL_WORKER=true.
 */
function mailWorkerPlugin(): Plugin {
  let child: ChildProcess | null = null;
  return {
    name: 'weby-mail-worker',
    configureServer(server) {
      if (process.env.DISABLE_MAIL_WORKER === 'true') return;
      const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      child = spawn(process.execPath, [tsxCli, 'mail/mail-worker.ts'], {
        cwd: rootDir,
        stdio: 'inherit',
      });
      child.on('error', (err) => {
        console.error('[mail-worker] failed to start:', err.message);
      });
      child.on('exit', (code) => {
        if (code && code !== 0) {
          console.warn(`[mail-worker] exited with code ${code}`);
        }
      });
      const kill = () => child?.kill();
      server.httpServer?.once('close', kill);
    },
    closeBundle() {
      child?.kill();
      child = null;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), mailWorkerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
