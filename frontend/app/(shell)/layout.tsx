import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PlaceholderBanner from '@/components/PlaceholderBanner';

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <PlaceholderBanner />
      {children}
      <Footer />
    </>
  );
}
