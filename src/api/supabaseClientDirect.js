// Direct Supabase client - replaces Base44 adapter
import { supabase, supabaseFunctionsUrl } from './supabaseClient';

// Utility: simple UUID v4/v5 format checker
function isUUID(value) {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// Entity operations
const entities = {
  User: {
    async list() {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('users').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('users').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('users').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Site: {
    async list(orderBy = '-created_at', limit = 1000) {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('sites').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('sites').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      query = query.order('created_at', { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('sites').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('sites').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('sites').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Plugin: {
    async list(orderBy = '-created_at', limit = 1000) {
      const { data, error } = await supabase
        .from('plugins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('plugins').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('plugins').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      query = query.order('created_at', { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('plugins').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('plugins').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('plugins').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Theme: {
    async list(orderBy = '-created_at', limit = 1000) {
      const { data, error } = await supabase
        .from('themes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('themes').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('themes').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      query = query.order('created_at', { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('themes').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('themes').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('themes').delete().eq('id', id);
      if (error) throw error;
    }
  },

  SubscriptionPlan: {
    async list(orderBy = 'sort_order', limit = 1000) {
      let query = supabase.from('subscription_plans').select('*');
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      // Avoid invalid uuid filter errors if legacy IDs are passed
      if (!isUUID(id)) {
        return null;
      }
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = 'sort_order', limit = 1000) {
      // If filtering by id with a non-UUID, return empty to avoid errors
      if (filters && typeof filters.id === 'string' && !isUUID(filters.id)) {
        return [];
      }
      let query = supabase.from('subscription_plans').select('*');
      Object.entries(filters || {}).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('subscription_plans').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('subscription_plans').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('subscription_plans').delete().eq('id', id);
      if (error) throw error;
    }
  },

  PlanGroup: {
    async list(orderBy = 'sort_order', limit = 1000) {
      let query = supabase.from('plan_groups').select('*');
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('plan_groups').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = 'sort_order', limit = 1000) {
      let query = supabase.from('plan_groups').select('*');
      Object.entries(filters || {}).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('plan_groups').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('plan_groups').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('plan_groups').delete().eq('id', id);
      if (error) throw error;
    }
  },

  UserSubscription: {
    async list(orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('user_subscriptions').select('*');
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('user_subscriptions').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('user_subscriptions').select('*');
      Object.entries(filters || {}).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('user_subscriptions').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('user_subscriptions').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('user_subscriptions').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Invoice: {
    async list(orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('invoices').select('*');
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('invoices').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters, orderBy = '-created_at', limit = 1000) {
      let query = supabase.from('invoices').select('*');
      Object.entries(filters || {}).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('invoices').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('invoices').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Team: {
    async list() {
      const { data, error } = await supabase.from('teams').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('teams').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('teams').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('teams').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('teams').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Connector: {
    async list(orderBy) {
      let query = supabase.from('connectors').select('*');
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        const field = desc ? orderBy.slice(1) : orderBy;
        query = query.order(field, { ascending: !desc });
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('connectors').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('connectors').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('connectors').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('connectors').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('connectors').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Project: {
    async list() {
      const { data, error } = await supabase.from('projects').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('projects').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('projects').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('projects').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Message: {
    async list() {
      const { data, error } = await supabase.from('messages').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('messages').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('messages').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('messages').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('messages').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('messages').delete().eq('id', id);
      if (error) throw error;
    }
  },

  Notification: {
    async list() {
      const { data, error } = await supabase.from('notifications').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('notifications').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('notifications').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('notifications').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('notifications').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
    }
  },

  ActivityLog: {
    async list() {
      const { data, error } = await supabase.from('activity_logs').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('activity_logs').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('activity_logs').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('activity_logs').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('activity_logs').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('activity_logs').delete().eq('id', id);
      if (error) throw error;
    }
  },

  SiteSettings: {
    async list() {
      const { data, error } = await supabase.from('site_settings').select('*');
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from('site_settings').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async filter(filters) {
      let query = supabase.from('site_settings').select('*');
      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase.from('site_settings').insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase.from('site_settings').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from('site_settings').delete().eq('id', id);
      if (error) throw error;
    }
  }
};

// Auth operations
const auth = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .single();
      const merged = {
        ...(userData || {}),
        // Canonical Supabase Auth UUID for requests
        auth_id: user.id,
        email: user.email,
      };
      return merged;
    }
    return null;
  },

  async updateMe(data) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update(data)
        .eq('email', user.email)
        .select()
        .single();
      if (error) throw error;
      return updatedUser;
    }
    throw new Error('No authenticated user');
  },

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};

// Functions (Supabase Edge Functions)
const functions = {
  async invoke(name, payload = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || null;

    const url = `${supabaseFunctionsUrl.replace(/\/$/, '')}/${name}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    let data;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const message = data?.error ? `Function ${name} failed: ${data.error}` : `Function ${name} invoke failed: ${res.status}`;
      const err = new Error(message);
      err.data = data;
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return { data };
  }
};

// Integrations
const integrations = {
  Core: {
    async UploadFile({ file, bucket = 'uploads' }) {
      const fileName = `${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return { file_url: publicUrl };
    }
  }
};

// Query helper (simplified)
const Query = {
  async run(query, params = {}) {
    // This would need to be implemented based on your specific query needs
    console.warn('Query.run not implemented - use direct Supabase queries');
    return [];
  }
};

// Export the complete client object
export const supabaseClientDirect = {
  entities,
  auth,
  functions,
  integrations,
  Query
};