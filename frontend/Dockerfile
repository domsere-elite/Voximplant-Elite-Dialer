# frontend/Dockerfile
# -------- builder --------
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_DIALER_API_URL
ARG NEXT_PUBLIC_CRM_URL
ARG NEXT_PUBLIC_VOXIMPLANT_APPLICATION
ARG NEXT_PUBLIC_VOXIMPLANT_ACCOUNT

ENV NEXT_PUBLIC_DIALER_API_URL=$NEXT_PUBLIC_DIALER_API_URL
ENV NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL
ENV NEXT_PUBLIC_VOXIMPLANT_APPLICATION=$NEXT_PUBLIC_VOXIMPLANT_APPLICATION
ENV NEXT_PUBLIC_VOXIMPLANT_ACCOUNT=$NEXT_PUBLIC_VOXIMPLANT_ACCOUNT

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# -------- runner --------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
