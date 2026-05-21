import app from './app';

const PORT = Number(process.env.PORT) || 4001;

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});
