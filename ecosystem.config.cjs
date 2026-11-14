module.exports = {
  apps: [
    {
      name: 'google-sheets-mcp',
      script: 'src/index.mjs',
      args: '--http',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
