'use client';
import React, { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Header from './header';
import CalculatorPanel from './calculator-panel';
import OffersPanel from './offers-panel';
import type { OrderItem, ClientInfo } from './calculator-panel';
import type { SavedOffer } from './offers-panel';

export type { OrderItem, ClientInfo };

const emptyClient: ClientInfo = { firstName: '', lastName: '', company: '', address: '', nip: '', phone: '', email: '' };

export default function MainClient() {
  const { data: session, status } = useSession() || {};
  const [activeTab, setActiveTab] = useState<'calculator' | 'offers'>('calculator');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [clientInfo, setClientInfo] = useState<ClientInfo>(emptyClient);

  // Editing offer state
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editingOfferName, setEditingOfferName] = useState<string | null>(null);

  // ─── Order item CRUD ───
  const addToOrder = useCallback((item: OrderItem) => {
    setOrderItems((prev: OrderItem[]) => [...(prev ?? []), item]);
  }, []);

  const updateOrderItem = useCallback((id: string, item: OrderItem) => {
    setOrderItems((prev: OrderItem[]) => (prev ?? []).map((o: OrderItem) => o?.id === id ? item : o));
  }, []);

  const removeOrderItem = useCallback((id: string) => {
    setOrderItems((prev: OrderItem[]) => (prev ?? []).filter((o: OrderItem) => o?.id !== id));
  }, []);

  const duplicateOrderItem = useCallback((id: string) => {
    setOrderItems((prev: OrderItem[]) => {
      const item = (prev ?? []).find((o: OrderItem) => o?.id === id);
      if (!item) return prev;
      return [...prev, { ...(item ?? {}), id: Date.now().toString() + Math.random().toString(36).slice(2) } as OrderItem];
    });
  }, []);

  const clearOrders = useCallback(() => {
    setOrderItems([]);
    setEditingOfferId(null);
    setEditingOfferName(null);
  }, []);

  // ─── Save new offer ───
  const handleSaveOffer = useCallback(async (name: string, items: OrderItem[]) => {
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: name, data: { items, clientInfo } }),
    });
    if (!res?.ok) throw new Error('Save failed');
    const saved = await res.json();
    setEditingOfferId(saved.id);
    setEditingOfferName(name);
  }, [clientInfo]);

  // ─── Update existing offer ───
  const handleUpdateOffer = useCallback(async (id: string, name: string, items: OrderItem[]) => {
    const res = await fetch(`/api/offers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: name, data: { items, clientInfo } }),
    });
    if (!res?.ok) throw new Error('Update failed');
    setEditingOfferName(name);
  }, [clientInfo]);

  // ─── Edit offer: load items into calculator ───
  const handleEditOffer = useCallback((offer: SavedOffer) => {
    const items: OrderItem[] = offer.data?.items ?? [];
    setOrderItems(items);
    setEditingOfferId(offer.id);
    setEditingOfferName(offer.name);
    if (offer.data?.clientInfo) setClientInfo(offer.data.clientInfo);
    setActiveTab('calculator');
  }, []);

  // ─── Cancel editing ───
  const handleCancelEdit = useCallback(() => {
    setEditingOfferId(null);
    setEditingOfferName(null);
    setOrderItems([]);
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-skin-bg">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-skin-bg text-txt-primary">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="app-container">
        {activeTab === 'calculator' ? (
          <CalculatorPanel
            orderItems={orderItems}
            onAddToOrder={addToOrder}
            onRemoveOrder={removeOrderItem}
            onDuplicateOrder={duplicateOrderItem}
            onUpdateOrder={updateOrderItem}
            onClearOrders={clearOrders}
            onSaveOffer={handleSaveOffer}
            onUpdateOffer={handleUpdateOffer}
            editingOfferId={editingOfferId}
            editingOfferName={editingOfferName}
            onCancelEdit={handleCancelEdit}
            clientInfo={clientInfo}
            onClientInfoChange={setClientInfo}
          />
        ) : (
          <OffersPanel onEditOffer={handleEditOffer} />
        )}
      </div>
    </div>
  );
}
