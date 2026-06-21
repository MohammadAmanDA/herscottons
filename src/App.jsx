import React from 'react';
import Spline from '@splinetool/react-spline';

const instagramData = [
  {
    id: 1,
    url: 'https://www.instagram.com/herscottons/p/DW_GNyTk9mD/',
    label: 'New Arrivals',
    gradient: 'linear-gradient(160deg,#F9DDD0,#ECC9B0)'
  },
  {
    id: 2,
    url: 'https://www.instagram.com/herscottons/p/DV8eWV8CPdb/',
    label: 'Summer Essentials',
    gradient: 'linear-gradient(160deg,#EAD5C3,#D2B49C)'
  }
];

export default function App() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#222] font-sans antialiased">
      {/* Luxury Navbar */}
      <nav className="flex justify-between items-center px-8 py-6 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <span className="text-2xl font-semibold tracking-widest uppercase">HersCottons</span>
        <div className="space-x-8 text-sm uppercase tracking-wider text-gray-500">
          <a href="#" className="hover:text-black transition">Collections</a>
          <a href="#" className="hover:text-black transition">Journal</a>
          <a href="#" className="hover:text-black transition">Our Story</a>
        </div>
      </nav>

      {/* Hero Section with Interactive 3D Spline Canvas */}
      <header className="relative w-full h-[85vh] flex flex-col md:flex-row items-center px-8 md:px-16 overflow-hidden bg-white">
        <div className="md:w-1/2 z-10 space-y-6 max-w-xl py-12">
          <span className="text-xs font-bold tracking-[0.3em] uppercase text-gray-400">Premium Loungewear</span>
          <h1 className="text-5xl md:text-7xl font-light tracking-tight leading-tight text-gray-900">
            Woven from pure <span className="font-normal italic">comfort</span>.
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed max-w-md">
            Organic, sustainable, and meticulously tailored collections designed to elevate your daily routine.
          </p>
          <button className="bg-black text-white text-xs uppercase tracking-widest px-8 py-4 hover:bg-gray-800 transition-all duration-300">
            Explore Collection
          </button>
        </div>

        {/* 3D Interactive Canvas Anchor Container */}
        <div className="w-full md:w-1/2 h-[50vh] md:h-full relative flex items-center justify-center">
          <div className="w-full h-full absolute inset-0 bg-gradient-to-tr from-[#FAF9F6] to-transparent rounded-2xl overflow-hidden">
            <Spline scene="https://prod.spline.design/6Wq1Q7YGyM-Z09Z9/scene.splinecode" />
          </div>
        </div>
      </header>

      {/* Interactive Mock Instagram Content Grid Section */}
      <main className="max-w-7xl mx-auto px-8 py-24">
        <div className="mb-12 space-y-2">
          <h2 className="text-2xl font-light tracking-wider uppercase">Editorial Showcase</h2>
          <p className="text-sm text-gray-400">Curated looks straight from our digital journal</p>
        </div>

        <div className="w-full min-h-[500px] overflow-hidden bg-white rounded-lg">
          <div dangerouslySetInnerHTML={{ __html: '<behold-widget feed-id="yKpkR9oqgRKWZYEcDPbw"></behold-widget>' }} />
        </div>
      </main>
    </div>
  );
}