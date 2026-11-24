// Layout for the legal pages: a readable column with numbered sections (the numbering is what people cite).
import { company } from "@/lib/site";

export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[760px] px-5 pt-14 sm:px-8">
      <h1 className="text-[44px] sm:text-[52px]">{title}</h1>
      <p className="mt-3 text-[15px] text-[var(--faint)]">Last updated {company.updated}</p>
      <div className="legal mt-10 flex flex-col gap-4 text-[16.5px] leading-[1.7] text-[var(--dim)] [&_h2]:mt-8 [&_h2]:text-[24px] [&_h2]:text-[var(--text)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--text)]">
        {children}
      </div>
    </main>
  );
}

export function Contact() {
  return company.email ? (
    <a href={`mailto:${company.email}`} className="font-semibold text-[var(--text)] underline decoration-[var(--rule)]">
      {company.email}
    </a>
  ) : (
    <>the support address in your receipt</>
  );
}
