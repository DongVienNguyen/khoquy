import { ImageResponse } from 'next/og';

export const GET = async () => {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#ffffff',
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: -1
        }}
      >
        CRC
      </div>
    ),
    { width: 180, height: 180 }
  );
};