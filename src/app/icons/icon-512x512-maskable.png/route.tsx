import { ImageResponse } from 'next/og';

export const GET = async () => {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: 200,
          fontWeight: 800,
          letterSpacing: -2
        }}
      >
        CRC
      </div>
    ),
    { width: 512, height: 512 }
  );
};