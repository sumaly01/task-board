import { redirect } from 'next/navigation';

// Root path redirects to dashboard; middleware will catch unauthenticated users
// and send them to /login before the dashboard page ever renders.
export default function Home() {
  redirect('/dashboard');
}
