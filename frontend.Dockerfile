# The dashboard frontend, built from this project without its backend:
# `ajs dms build` reads antelope.config.ts (-e production) and the frontend of
# each installed module. Deploy it from the project root next to the backend,
# from the same commit (ajs-cloud link --dockerfile frontend=frontend.Dockerfile).
FROM node:24-slim
RUN corepack enable
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile \
  && pnpm run build \
  && ./node_modules/.bin/ajs project build -e production \
  && ./node_modules/.bin/ajs-dms build
ENV NODE_ENV=production
# Started from the installed binary, not through pnpm: corepack would fetch
# pnpm from the registry at container start.
CMD ["/app/node_modules/.bin/ajs-dms", "start"]
