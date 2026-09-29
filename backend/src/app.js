import express from 'express';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Routes and business behavior will be introduced in later phases.
