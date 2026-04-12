module.exports = {
  apps: [
    {
      name: 'topic-hub',
      cwd: __dirname,
      script: 'start-remote.sh',
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
    },
  ],
};
