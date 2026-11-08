if (process.env.CI !== 'true' && process.env.NODE_ENV !== 'production') {
  const { default: husky } = await import('husky');
  const error = husky();
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
