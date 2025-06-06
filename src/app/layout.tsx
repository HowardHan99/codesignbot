import React, {PropsWithChildren} from 'react';
import Script from 'next/script';
import {MiroSDKInit} from '../components/SDKInit';

export const metadata = {
  title: 'CoDesign Bot',
  description: 'A design critique assistant powered by AI',
};

export default function RootLayout({children}: PropsWithChildren) {
  return (
    <html>
      <body>
        <Script
          src="https://miro.com/app/static/sdk/v2/miro.js"
          strategy="beforeInteractive"
        />
        <MiroSDKInit />
        <div id="root">
          <div className="grid">
            <div className="cs1 ce12">{children}</div>
            <div className="cs1 ce12"></div>
          </div>
        </div>
      </body>
    </html>
  );
}
