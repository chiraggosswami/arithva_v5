import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { couriers, customers, pincodes, products, seedOrders, type Order, type Product, type Pin, type Customer, type Courier } from '../data/seed';
import { DEFAULT_ENGINE_CONFIG, evaluate, type EngineConfig } from '../engine';
import { SELLERS, DEFAULT_SELLER, type Seller } from '../data/sellers';

type State = {
  orders: Order[];
  engineConfig: EngineConfig;
  sellers: Seller[];
  currentSellerId: string;
  currentSeller: Seller;
  setCurrentSellerId: (id: string) => void;
  sellerOrders: Order[];
  allProducts: Product[];
  allPincodes: Pin[];
  allCouriers: Courier[];
  allCustomers: Customer[];
  addOrder: (o: Order) => void;
  addSeller: (s: Seller) => void;
  importOrdersForSeller: (
    seller: Seller,
    newOrders: Order[],
    newProducts?: Product[],
    newPincodes?: Pin[],
    newCustomers?: Customer[]
  ) => { importedCount: number; duplicateCount: number };
  event: (id: string, event: string) => void;
  updateOrder: (id: string, patch: Partial<Order>, timelineLabel?: string) => void;
  updateEngineConfig: (config: EngineConfig) => void;
};

const Ctx = createContext<State | null>(null);

export function AppState({ children }: { children: ReactNode }) {
  // 1. Sellers State
  const [sellers, setSellers] = useState<Seller[]>(() => {
    try {
      const saved = localStorage.getItem('arthiva-sellers') || localStorage.getItem('margin-pilot-sellers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with predefined SELLERS to preserve defaults
          const ids = new Set(parsed.map((s: Seller) => s.id));
          const missingDefaults = SELLERS.filter(s => !ids.has(s.id));
          return [...parsed, ...missingDefaults];
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved sellers:', e);
    }
    return SELLERS;
  });

  // 2. Active Seller ID
  const [currentSellerId, setCurrentSellerIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('arthiva-current-seller') || localStorage.getItem('naomi-current-seller');
      return saved || DEFAULT_SELLER.id;
    } catch {
      return DEFAULT_SELLER.id;
    }
  });

  // 3. Products Catalog State
  const [allProducts, setAllProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('arthiva-products');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved products:', e);
    }
    return products;
  });

  // 4. Pincodes State
  const [allPincodes, setAllPincodes] = useState<Pin[]>(() => {
    try {
      const saved = localStorage.getItem('arthiva-pincodes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved pincodes:', e);
    }
    return pincodes;
  });

  // 5. Customers State
  const [allCustomers, setAllCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem('arthiva-customers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved customers:', e);
    }
    return customers;
  });

  // 6. Orders State
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('arthiva-state') || localStorage.getItem('margin-pilot-state') || localStorage.getItem('naomi-state');
      return saved ? JSON.parse(saved) : seedOrders;
    } catch {
      return seedOrders;
    }
  });

  // 7. Engine Rules Config
  const [engineConfig, setEngineConfig] = useState<EngineConfig>(() => {
    try {
      const saved = localStorage.getItem('arthiva-rules') || localStorage.getItem('margin-pilot-rules') || localStorage.getItem('naomi-rules');
      return saved ? JSON.parse(saved) : DEFAULT_ENGINE_CONFIG;
    } catch {
      return DEFAULT_ENGINE_CONFIG;
    }
  });

  const currentSeller = useMemo(() => {
    return sellers.find(s => s.id === currentSellerId) || sellers[0] || DEFAULT_SELLER;
  }, [sellers, currentSellerId]);

  const setCurrentSellerId = (id: string) => {
    setCurrentSellerIdState(id);
    localStorage.setItem('arthiva-current-seller', id);
    localStorage.setItem('naomi-current-seller', id);
  };

  // Sync CSS variables whenever currentSeller changes
  useEffect(() => {
    if (!currentSeller) return;
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', currentSeller.accentColor.primary);
    root.style.setProperty('--brand-secondary', currentSeller.accentColor.secondary);
    root.style.setProperty('--brand-highlight', currentSeller.accentColor.highlight);
    root.style.setProperty('--brand-light-bg', currentSeller.accentColor.lightBg);
    root.style.setProperty('--brand-border', currentSeller.accentColor.border);
  }, [currentSeller]);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('arthiva-sellers', JSON.stringify(sellers));
  }, [sellers]);

  useEffect(() => {
    localStorage.setItem('arthiva-state', JSON.stringify(orders));
    localStorage.setItem('naomi-state', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('arthiva-products', JSON.stringify(allProducts));
  }, [allProducts]);

  useEffect(() => {
    localStorage.setItem('arthiva-pincodes', JSON.stringify(allPincodes));
  }, [allPincodes]);

  useEffect(() => {
    localStorage.setItem('arthiva-customers', JSON.stringify(allCustomers));
  }, [allCustomers]);

  useEffect(() => {
    localStorage.setItem('arthiva-rules', JSON.stringify(engineConfig));
    localStorage.setItem('naomi-rules', JSON.stringify(engineConfig));
  }, [engineConfig]);

  const addOrder = (o: Order) => setOrders(prev => [o, ...prev]);

  const addSeller = (s: Seller) => {
    setSellers(prev => {
      if (prev.some(x => x.id === s.id)) {
        return prev.map(x => x.id === s.id ? s : x);
      }
      return [...prev, s];
    });
  };

  const importOrdersForSeller = (
    seller: Seller,
    newOrders: Order[],
    newProducts: Product[] = [],
    newPins: Pin[] = [],
    newCusts: Customer[] = []
  ) => {
    // 1. Ensure seller exists in state
    addSeller(seller);

    // 2. Ingest products without duplicates
    if (newProducts.length > 0) {
      setAllProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const toAdd = newProducts.filter(p => !existingIds.has(p.id));
        return [...toAdd, ...prev];
      });
    }

    // 3. Ingest pincodes without duplicates
    if (newPins.length > 0) {
      setAllPincodes(prev => {
        const existingCodes = new Set(prev.map(p => p.code));
        const toAdd = newPins.filter(p => !existingCodes.has(p.code));
        return [...toAdd, ...prev];
      });
    }

    // 4. Ingest customers without duplicates
    if (newCusts.length > 0) {
      setAllCustomers(prev => {
        const existingCustIds = new Set(prev.map(c => c.id));
        const toAdd = newCusts.filter(c => !existingCustIds.has(c.id));
        return [...toAdd, ...prev];
      });
    }

    // 5. Ingest orders with deduplication
    let duplicateCount = 0;
    let importedCount = 0;

    setOrders(prev => {
      const existingOrderIds = new Set(prev.map(o => o.id.trim().toUpperCase()));
      const filteredNewOrders: Order[] = [];

      for (const ord of newOrders) {
        const upper = ord.id.trim().toUpperCase();
        if (existingOrderIds.has(upper)) {
          duplicateCount++;
          // Update the order in-place if it has newer data for this seller
        } else {
          filteredNewOrders.push(ord);
          existingOrderIds.add(upper);
          importedCount++;
        }
      }

      return [...filteredNewOrders, ...prev];
    });

    // 6. Switch active seller immediately to the newly onboarded seller
    setCurrentSellerId(seller.id);

    return { importedCount, duplicateCount };
  };

  const recalculate = (updated: Order, config = engineConfig) => {
    const p = allProducts.find(x => x.id === updated.productId || x.name === updated.productId) || {
      id: updated.productId || `P_${updated.id}`,
      name: (updated as any).productName || updated.productId || 'Item',
      price: updated.value || 1000,
      cogs: (updated as any).cogs ?? Math.max(100, Math.round((updated.value || 1000) * 0.35)),
      damageRate: 0.02,
      sellerId: updated.sellerId
    };
    const pin = allPincodes.find(x => x.code === updated.pincode) || {
      code: updated.pincode || '110001',
      city: (updated as any).city || 'Metro City',
      state: (updated as any).state || 'India',
      rtoRate: (updated as any).rtoRate ?? 0.18,
      success: 1 - ((updated as any).rtoRate ?? 0.18)
    };
    const courier = couriers.find(x => x.id === updated.courierId) || couriers[0];
    const customer = allCustomers.find(x => x.id === updated.customerId) || {
      id: updated.customerId || `C_${updated.id}`,
      name: updated.customerName || 'Customer',
      phone: updated.customerPhone || '+91 9800000000',
      city: pin.city,
      orders: 1,
      rtos: 0,
      prepaid: updated.payment === 'Prepaid' ? 1 : 0
    };
    const ev = evaluate(updated, p, pin, courier, customer, config);
    return { ...updated, score: ev.score, journey: ev.best.name };
  };

  const event = (id: string, label: string) => setOrders(prev => prev.map(o => {
    if (o.id !== id) return o;
    const updated = {
      ...o,
      addressVerified: o.addressVerified || label === 'Address verified',
      addressComplete: o.addressComplete || label === 'Address verified',
      otpPassed: o.otpPassed || label === 'OTP passed',
      advancePaid: o.advancePaid || label === 'Advance paid',
      status: label === 'NDR raised' ? 'NDR raised' : label === 'RTO initiated' ? 'RTO initiated' : label === 'Delivery attempted' ? 'Out for delivery' : label === 'Address verified' ? 'Address verified' : label === 'OTP passed' ? 'Confirmed' : o.status,
      timeline: [...o.timeline, { label, at: 'Just now' }]
    };
    return recalculate(updated);
  }));

  const updateOrder = (id: string, patch: Partial<Order>, timelineLabel?: string) => setOrders(prev => prev.map(o => {
    if (o.id !== id) return o;
    const updated = { ...o, ...patch, timeline: timelineLabel ? [...o.timeline, { label: timelineLabel, at: 'Just now' }] : o.timeline };
    return recalculate(updated);
  }));

  const updateEngineConfig = (config: EngineConfig) => {
    setEngineConfig(config);
    setOrders(current => current.map(o => recalculate(o, config)));
  };

  // sellerOrders: strictly the orders that belong to the current seller
  const sellerOrders = useMemo(() => {
    return orders.filter(o => o.sellerId === currentSellerId);
  }, [orders, currentSellerId]);

  const value = useMemo(() => ({
    orders,
    engineConfig,
    sellers,
    currentSellerId,
    currentSeller,
    setCurrentSellerId,
    sellerOrders,
    allProducts,
    allPincodes,
    allCouriers: couriers,
    allCustomers,
    addOrder,
    addSeller,
    importOrdersForSeller,
    event,
    updateOrder,
    updateEngineConfig
  }), [orders, engineConfig, sellers, currentSellerId, currentSeller, sellerOrders, allProducts, allPincodes, allCustomers]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const value = useContext(Ctx);
  if (!value) throw new Error('AppState provider missing');
  return value;
}
