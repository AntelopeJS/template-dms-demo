# Temporary (af/integration only): Cloud's generated Dockerfile installs from
# package.json and the lockfile before COPY . ., so the vendored
# file:vendor/*.tgz dependency is not there yet and pnpm fails with ENOENT.
# Copying the sources first lets the install see the tarball.
FROM node:24-slim
RUN corepack enable
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm run build
ENV NODE_ENV=production
CMD ["pnpm", "start"]
