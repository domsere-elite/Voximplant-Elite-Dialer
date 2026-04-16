/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_DIALER_API_URL: process.env.NEXT_PUBLIC_DIALER_API_URL,
    NEXT_PUBLIC_CRM_URL: process.env.NEXT_PUBLIC_CRM_URL,
    NEXT_PUBLIC_VOXIMPLANT_APPLICATION: process.env.NEXT_PUBLIC_VOXIMPLANT_APPLICATION,
    NEXT_PUBLIC_VOXIMPLANT_ACCOUNT: process.env.NEXT_PUBLIC_VOXIMPLANT_ACCOUNT
  }
};

module.exports = nextConfig;
