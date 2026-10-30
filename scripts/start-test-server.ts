/*
 * Copyright 2018-2025 Elyra Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { exec, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

const config = path.join(__dirname, '..', 'cypress', 'test-config.py');
const jupyter = exec(`jupyter lab --config ${config}`);

const CONTAINER_NAME = 'minio_test';
const MINIO_PORT = 9000;

const logDir = path.join(__dirname, '..', 'build', 'cypress');
const jupyterLog = fs.createWriteStream(path.join(logDir, 'jupyter.log'));
jupyter.stderr?.pipe(jupyterLog);
const dockerLog = fs.createWriteStream(path.join(logDir, 'docker.log'));

/**
 * Check if MinIO is already reachable on port 9000 (e.g. started by CI as a
 * binary before this script runs).  Returns a Promise that resolves to true if
 * reachable, false otherwise.
 */
const isMinioRunning = (): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${MINIO_PORT}/minio/health/live`,
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      }
    );
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });

const handleTeardown = (): void => {
  spawn('docker', ['kill', CONTAINER_NAME]);
  process.exit();
};

process.on('SIGINT', handleTeardown);
process.on('SIGTERM', handleTeardown);

// Only start a Docker container when MinIO is not already available (e.g. in
// local development).  In CI the minio binary is started before this script.
isMinioRunning().then((already) => {
  if (already) {
    dockerLog.write('MinIO already running on port 9000; skipping Docker.\n');
    return;
  }

  const docker = spawn('docker', [
    'run',
    '--rm',
    '--name',
    CONTAINER_NAME,
    '-p',
    `${MINIO_PORT}:${MINIO_PORT}`,
    'quay.io/minio/minio',
    'server',
    '/data'
  ]);
  docker.stderr.pipe(dockerLog);
});
