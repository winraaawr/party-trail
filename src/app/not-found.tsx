import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-screen">
      <div className="center-card px px-lift">
        <h1>Off the map</h1>
        <p>There’s nothing at this address. The trail picks up again from your trips.</p>
        <Link href="/" className="btn btn--primary">
          Back to your trips
        </Link>
      </div>
    </main>
  );
}
