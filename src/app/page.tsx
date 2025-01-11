import Head from 'next/head';
import BabylonScene from '../components/BabylonScene';

export default function Home() {
  return (
    <div>
      <Head>
        <title>My Babylon App</title>
        <meta name="description" content="A Next.js app integrated with Babylon.js" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <BabylonScene />
      </main>
    </div>
  );
}