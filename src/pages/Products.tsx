// src/pages/Products.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Grid, List, Search } from 'lucide-react';
import ProductCard from '../components/UI/ProductCard';
import api from '../config/api';
import { productService } from '../services/productService';
import type { Product } from '../types';
import SEO from '../components/Layout/SEO';

/* ---------- helpers ---------- */
const getId = (p: any): string | undefined => p?._id || p?.id;

/* ---------- category normalization ---------- */
// slug/aliases -> exact display name (backend enum)
const CATEGORY_ALIAS_TO_NAME: Record<string, string> = {
  tws: 'TWS',
  neckband: 'Bluetooth Neckbands',
  neckbands: 'Bluetooth Neckbands',
  'bluetooth-neckband': 'Bluetooth Neckbands',
  'bluetooth-neckbands': 'Bluetooth Neckbands',
  chargers: 'Mobile Chargers',
  'mobile-charger': 'Mobile Chargers',
  'mobile-chargers': 'Mobile Chargers',
  'car-charger': 'Car Chargers',
  'car-chargers': 'Car Chargers',
  'data-cable': 'Data Cables',
  'data-cables': 'Data Cables',
  speakers: 'Bluetooth Speakers',
  'bluetooth-speaker': 'Bluetooth Speakers',
  'bluetooth-speakers': 'Bluetooth Speakers',
  banks: 'Power Banks',
  'power-bank': 'Power Banks',
  'power-banks': 'Power Banks',
  'ICs': 'Integrated Circuits & Chips',
  'mobile-repairing-tools': 'Mobile Repairing Tools',
  
  electronics: 'Electronics',
  accessories: 'Accessories',
  others: 'Others',
};

// exact display name -> preferred slug (for URL writing)
const NAME_TO_SLUG: Record<string, string> = {
  'TWS': 'tws',
  'Bluetooth Neckbands': 'bluetooth-neckbands',
  'Data Cables': 'data-cables',
  'Mobile Chargers': 'mobile-chargers',
  'Car Chargers': 'car-chargers',
  'Bluetooth Speakers': 'bluetooth-speakers',
  'Power Banks': 'power-banks',
  'Integrated Circuits & Chips': 'ICs',
  'Mobile Repairing Tools': 'mobile-repairing-tools',
  'Electronics': 'electronics',
  'Accessories': 'accessories',
  'Others': 'others',
};

const Products: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategorySlug = (searchParams.get('category') || '').trim().toLowerCase();

  // URL se normalized category (exact name)
  const normalizedFromUrl =
    (urlCategorySlug && CATEGORY_ALIAS_TO_NAME[urlCategorySlug]) || '';

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(normalizedFromUrl);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 20000]);
  const [sortBy, setSortBy] = useState<'name' | 'price-low' | 'price-high' | 'rating'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Categories: try API, fall back to static
  const [categories, setCategories] = useState<string[]>([
    'TWS',
    'Bluetooth Neckbands',
    'Data Cables',
    'Mobile Chargers',
    'Integrated Circuits & Chips',
    'Mobile Repairing Tools',
    'Electronics',
    'Accessories',
    'Car Chargers',
    'Bluetooth Speakers',
    'Power Banks',
    'Others',
    'ICs'
  ]);

  /* ---------- TWO-WAY SYNC: URL -> dropdown ---------- */
  useEffect(() => {
    // agar URL me slug hai, dropdown ko exact name pe le aao
    if (normalizedFromUrl && normalizedFromUrl !== selectedCategory) {
      setSelectedCategory(normalizedFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedFromUrl]);

  /* ---------- TWO-WAY SYNC: dropdown -> URL ---------- */
  useEffect(() => {
    const currentSlug = (searchParams.get('category') || '').trim().toLowerCase();
    const nextSlug = selectedCategory ? NAME_TO_SLUG[selectedCategory] : '';

    // URL ko update sirf tab karo jab value truly change ho
    const next = new URLSearchParams(searchParams);
    if (nextSlug) {
      if (currentSlug !== nextSlug) {
        next.set('category', nextSlug);
        setSearchParams(next, { replace: true });
      }
    } else if (currentSlug) {
      next.delete('category');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Effective category to use everywhere (API + client filter)
  const normalizedCategoryForApi = selectedCategory || normalizedFromUrl || '';

  /* ---------- fetch categories (best-effort) ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await productService.getCategories();
        const arr = (Array.isArray((r as any)?.categories) && (r as any).categories) || [];
        if (!cancelled && arr.length) setCategories(arr.filter(Boolean));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------- fetch products whenever category changes ---------- */
  const fetchProducts = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError('');

      const filters = normalizedCategoryForApi ? { category: normalizedCategoryForApi } : {};
      const response = await productService.getProducts(filters, forceRefresh);

      if (Array.isArray(response?.products)) {
        setProducts(response.products);
        if (forceRefresh) {
          sessionStorage.removeItem('force-refresh-products');
          localStorage.removeItem('force-refresh-products');
        }
      } else {
        setProducts([]);
        setError('Failed to load products');
      }
    } catch (err) {
      console.error('❌ Error fetching products via service:', err);
      setError('Failed to connect to server. Please try again later.');
      // Fallback unfiltered – UI will still filter
      try {
        const params = forceRefresh ? { _t: Date.now() } : {};
        const fallback = await api.get('/products', { params });
        const arr =
          (Array.isArray(fallback?.data?.products) && fallback.data.products) ||
          (Array.isArray(fallback?.data?.data) && fallback.data.data) ||
          (Array.isArray(fallback?.data) && fallback.data) ||
          [];
        setProducts(arr as Product[]);
        setError('');
      } catch (fallbackErr) {
        console.error('❌ Fallback also failed:', fallbackErr);
      }
    } finally {
      localStorage.setItem('last-product-fetch', String(Date.now()));
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCategoryForApi]);

  /* ---------- client-side safety net filter/sort ---------- */
  const filteredProducts = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const q = (searchTerm || '').toLowerCase();

    const filtered = list
      .filter((p) => {
        const name = (p?.name || '').toLowerCase();
        const desc = (p?.description || '').toLowerCase();
        const matchesSearch = !q || name.includes(q) || desc.includes(q);

        const matchesCategory =
          !normalizedCategoryForApi || p?.category === normalizedCategoryForApi;

        const priceVal = typeof p?.price === 'number' ? p.price : Number.NaN;
        const priceOk =
          Number.isFinite(priceVal) &&
          priceVal >= priceRange[0] &&
          priceVal <= priceRange[1];

        const isActive = p?.isActive !== false;

        return matchesSearch && matchesCategory && priceOk && isActive;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'price-low':  return (a.price ?? 0) - (b.price ?? 0);
          case 'price-high': return (b.price ?? 0) - (a.price ?? 0);
          case 'rating':     return (b.rating ?? 0) - (a.rating ?? 0);
          case 'name':
          default:           return (a.name || '').localeCompare(b.name || '');
        }
      });

    return filtered;
  }, [products, searchTerm, normalizedCategoryForApi, priceRange, sortBy]);

  const handleManualRefresh = () => fetchProducts(true);

  /* ---------- UI ---------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-xl text-gray-600">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">{error}</div>
          <button
            onClick={() => fetchProducts(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title={normalizedCategoryForApi ? `${normalizedCategoryForApi} — Shop Products` : 'Shop Products'}
        description="Browse TWS, Bluetooth neckbands, data cables, chargers, ICs, and tools."
        canonicalPath="/products"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: normalizedCategoryForApi ? `${normalizedCategoryForApi} Products` : 'Products',
          url: 'https://nakodamobile.in/products',
        }}
      />

      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            {normalizedCategoryForApi || 'Premium Tech Accessories'}
          </h1>
          <p className="text-xl md:text-2xl mb-8">
            {normalizedCategoryForApi
              ? `Discover ${normalizedCategoryForApi} from Nakoda Mobile`
              : 'Discover our curated collection of high-quality products'}
          </p>
          <div className="max-w-md mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-200" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Category */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <label className="text-sm font-medium text-gray-700">Category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <label className="text-sm font-medium text-gray-700">Price Range:</label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min={0}
                max={20000}
                value={priceRange[1]}
                onChange={(e) =>
                  setPriceRange(([lo]) => [
                    Math.max(0, lo),
                    Math.max(0, parseInt(e.target.value, 10) || 0),
                  ])
                }
                className="w-32"
              />
              <span className="text-sm text-gray-600">₹0 - ₹{priceRange[1].toLocaleString()}</span>
            </div>
          </div>

          {/* Sort */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Name</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          {/* View + Refresh */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              title="Grid view"
            >
              <Grid className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              title="List view"
            >
              <List className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleManualRefresh()}
              className="p-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
              title="Refresh Products"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Results meta */}
        <div className="mb-6">
          <p className="text-gray-600">
            Showing {filteredProducts.length} of {products.length} products
            {normalizedCategoryForApi && ` in ${normalizedCategoryForApi}`}
            {searchTerm && ` · matching "${searchTerm}"`}
          </p>
        </div>

        {/* Grid/List */}
        {filteredProducts.length > 0 ? (
          <motion.div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                : 'space-y-4'
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {filteredProducts.map((product, i) => {
              const key = getId(product) || `${product.name || 'item'}-${i}`;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ProductCard product={product} viewMode={viewMode} />
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No products found</h3>
            <p className="text-gray-500 mb-4">Try adjusting your search criteria or browse all categories</p>
            <div className="space-x-4">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('');
                  setPriceRange([0, 20000]);
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
              <button
                onClick={() => handleManualRefresh()}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Refresh Products
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Products;
