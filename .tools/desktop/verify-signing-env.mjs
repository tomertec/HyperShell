const certificatePath = process.env.CSC_LINK ?? process.env.WIN_CSC_LINK;
const certificatePassword =
  process.env.CSC_KEY_PASSWORD ?? process.env.WIN_CSC_KEY_PASSWORD;

if (!certificatePath) {
  throw new Error(
    "Missing signing certificate configuration. Set CSC_LINK (or WIN_CSC_LINK) before running package:win:signed."
  );
}

if (!certificatePassword) {
  throw new Error(
    "Missing signing certificate password. Set CSC_KEY_PASSWORD (or WIN_CSC_KEY_PASSWORD) before running package:win:signed."
  );
}

console.log("Signing environment variables detected.");
