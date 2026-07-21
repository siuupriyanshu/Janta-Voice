import Chat from "./Chat";

export default function Home() {
  return (
    <div className="page">
      <section className="intro">
        <h1>File a civic complaint — on-chain, in plain words</h1>
        <p>
          Describe a local problem in Nepali or English. Janta Voice classifies
          and summarizes it, then commits an immutable record to Solana devnet. A
          public <a href="/dashboard">dashboard</a> aggregates every report by
          category and location.
        </p>
      </section>
      <Chat />
    </div>
  );
}
