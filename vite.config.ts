import { defineConfig } from "vite"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      lib: path.resolve(__dirname, "lib"),
      assets: path.resolve(__dirname, "assets"),
    },
    dedupe: ["react", "react-dom"],
  },
})
