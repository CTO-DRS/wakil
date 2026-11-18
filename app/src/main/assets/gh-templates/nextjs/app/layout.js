import './globals.css';

export const metadata = { title: '@@APP_NAME@@' };

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
