# Kamil Postaağası, 2023501030
# Bonus 17: build with  docker build -t tasks-api .
FROM denoland/deno:2.9.8
WORKDIR /app

# Dependencies first: this layer is cached, so a code change does not download them again.
COPY deno.json deno.lock ./
COPY src/deps_warmup.ts ./src/deps_warmup.ts
RUN deno cache src/deps_warmup.ts

# Then the code and the migration files.
COPY src ./src
COPY drizzle ./drizzle
RUN deno cache src/main.ts

# The database, the KV file and the uploads live on /data: mount a volume there.
RUN mkdir /data && chown deno:deno /data
USER deno
ENV APP_ENV=development \
    DATABASE_URL=file:/data/tasks.db \
    KV_PATH=/data/kv.sqlite3 \
    UPLOAD_DIR=/data/uploads \
    PORT=8000
EXPOSE 8000

# Only the permissions the API needs (see the README for each flag).
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-ffi", "--allow-sys", "--unstable-kv", "--unstable-cron", "src/main.ts"]
