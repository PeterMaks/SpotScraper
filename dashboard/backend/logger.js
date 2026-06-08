const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

const logsDir = path.join(__dirname, 'logs');
fs.ensureDirSync(logsDir);

// Custom Winstron formatter to strip newlines and ANSI escape sequences from logs
const sanitizeFormat = winston.format((info) => {
  const cleanString = (val) => {
    if (typeof val !== 'string') return val;
    return val
      .replace(/[\r\n]/g, ' ')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  };

  if (info.message) {
    info.message = cleanString(info.message);
  }

  for (const [key, val] of Object.entries(info)) {
    if (key !== 'level' && key !== 'timestamp' && typeof val === 'string') {
      info[key] = cleanString(val);
    }
  }

  return info;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    sanitizeFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'audit.log') }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

module.exports = logger;
