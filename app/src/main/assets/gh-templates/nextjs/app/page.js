'use client';

import { useState } from 'react';

export default function Home() {
  const [count, setCount] = useState(0);
  return (
    <main className="card">
      <h1>مرحباً من @@APP_NAME@@ 🤖</h1>
      <p>ضغطت {count} مرة</p>
      <button onClick={() => setCount(count + 1)}>اضغطني</button>
    </main>
  );
}
