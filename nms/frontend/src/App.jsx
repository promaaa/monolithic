import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Loader, Save } from 'lucide-react';
import './App.css';

export default function OAINetworkManager() {
  const [activePage, setActivePage] = useState('config'); // 'config' | 'sim'

  const [plmnConfig, setPlmnConfig] = useState({
    gNB_ID: '0xe00',
    tracking_area_code: '1',
    mcc: '001',
    mnc: '01',
    nr_cellid: '12345678L',
    physCellId: '0',
    absoluteFrequencySSB: '642816',
    dl_absoluteFrequencyPointA: '641544'
  });


  const [sib8Config, setSib8Config] = useState({
    messageIdentifier: '1112',
    serialNumber: '3FF1',
    dataCodingScheme: '48',
    text: 'Hello',
    mode: '0'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [subscribers, setSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);

  const [newSubscriber, setNewSubscriber] = useState({
    ueid: '',
    encPermanentKey: '',
    encOpcKey: ''
  });

  const [editingSubscriber, setEditingSubscriber] = useState(null);

  const API_URL = 'http://localhost:3001/api';

  useEffect(() => {
    if (activePage === 'sim') fetchSubscribers();
    else fetchConfigs();
  }, [activePage]);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const [plmnRes, sib8Res] = await Promise.all([
        fetch(`${API_URL}/plmn`),
        fetch(`${API_URL}/sib8`)
      ]);

      if (plmnRes.ok && sib8Res.ok) {
        const plmnData = await plmnRes.json();
        const sib8Data = await sib8Res.json();
        setPlmnConfig(plmnData);
        setSib8Config(sib8Data);
        setMessage({ type: 'success', text: 'Configurations loaded successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to load configurations' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Cannot connect to backend server' });
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscribers = async () => {
    try {
      setSubsLoading(true);
      const res = await fetch(`${API_URL}/subscribers`);
      if (!res.ok) throw new Error('Failed to load subscribers');
      const data = await res.json();
      setSubscribers(data);
      setMessage({type: 'success', text: 'Subscribers loaded successfully'});
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to load subscribers' });
    } finally {
      setSubsLoading(false);
    }
  };

  const handleNewSubscriberChange = (field, value) => {
    setNewSubscriber(prev => ({ ...prev, [field]: value }));
  };

  const addSubscriber = async () => {
    if (!newSubscriber.ueid.trim()) {
      setMessage({ type: 'error', text: 'UEID is required' });
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubscriber)
      });

      if (!res.ok) throw new Error('Failed to add subscriber');

      setMessage({ type: 'success', text: 'Subscriber added' });
      setNewSubscriber({ ueid: '', encPermanentKey: '', encOpcKey: '' });
      fetchSubscribers();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to add subscriber' });
    } finally {
      setSaving(false);
    }
  };

  const startEditSubscriber = (sub) => {
    setEditingSubscriber({
      originalUeid: sub.ueid,  
      ueid: sub.ueid,                         
      encPermanentKey: sub.encPermanentKey || '',
      encOpcKey: sub.encOpcKey || ''
    });
  };


  const cancelEditSubscriber = () => {
    setEditingSubscriber(null);
  };

  const handleEditSubscriberChange = (field, value) => {
    setEditingSubscriber(prev => ({ ...prev, [field]: value }));
  };

  const saveEditedSubscriber = async () => {
  if (!editingSubscriber) return;

  const { originalUeid, ueid, encPermanentKey, encOpcKey } = editingSubscriber;

  if (!ueid.trim() && !encPermanentKey && !encOpcKey) {
    setMessage({ type: 'error', text: 'UEID or other fields must be provided' });
    return;
  }

  try {
    setSaving(true);
    const res = await fetch(`${API_URL}/subscribers/${encodeURIComponent(originalUeid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ueid: ueid || undefined,              
        encPermanentKey: encPermanentKey || undefined,
        encOpcKey: encOpcKey || undefined
      })
    });

    if (!res.ok) throw new Error('Failed to update subscriber');

    setMessage({ type: 'success', text: 'Subscriber updated' });
    setEditingSubscriber(null);
    fetchSubscribers();
  } catch (err) {
    console.error(err);
    setMessage({ type: 'error', text: 'Failed to update subscriber' });
  } finally {
    setSaving(false);
  }
  };


  const deleteSubscriber = async (ueid) => {
  if (!window.confirm(`Delete subscriber ${ueid}?`)) return;

  try {
    setSaving(true);
    const res = await fetch(`${API_URL}/subscribers/${encodeURIComponent(ueid)}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to delete subscriber');

    setMessage({ type: 'success', text: 'Subscriber deleted' });
    fetchSubscribers();
  } catch (err) {
    console.error(err);
    setMessage({ type: 'error', text: 'Failed to delete subscriber' });
  } finally {
    setSaving(false);
  }
  };

  const handlePlmnChange = (field, value) => {
    setPlmnConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSib8Change = (field, value) => {
    setSib8Config(prev => ({ ...prev, [field]: value }));
  };

  const savePlmnConfig = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/plmn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plmnConfig)
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'PLMN configuration saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save PLMN configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving PLMN configuration' });
    } finally {
      setSaving(false);
    }
  };

  const saveSib8Config = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/sib8`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sib8Config)
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'SIB8 configuration saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save SIB8 configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving SIB8 configuration' });
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <div className="loading-screen">
        <Loader className="w-12 h-12 animate-spin" />
        <p className="loading-text">Loading configurations...</p>
      </div>
    );
  }

  const renderConfigPage = () => (
    <div className="page">
      <h1>gNB Configuration</h1>
      <p className="subtitle">Configure your OpenAirInterface 5G gNB settings</p>

      {message.text && (
        <div className={`alert ${message.type}`}>
          {message.type === 'success'
            ? <CheckCircle size={20} />
            : <AlertCircle size={20} />
          }
          <span>{message.text}</span>
        </div>
      )}

      <div className="stack">
        <div className="card">
          <h2>PLMN Configuration</h2>
            

          <div className="form-row">
            <div className="form-group">
              <label>gNB ID</label>
              <input
                type="text"
                value={plmnConfig.gNB_ID}
                onChange={(e) => handlePlmnChange('gNB_ID', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>NR Cell ID</label>
              <input
                type="text"
                value={plmnConfig.nr_cellid}
                onChange={(e) => handlePlmnChange('nr_cellid', e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label>Physical Cell ID (PCI)</label>
              <input
                type="text"
                value={plmnConfig.physCellId}
                onChange={(e) => handlePlmnChange('physCellId', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Tracking Area Code</label>
            <input
              type="text"
              value={plmnConfig.tracking_area_code}
              onChange={(e) => handlePlmnChange('tracking_area_code', e.target.value)}
            />
          </div>
            
          <div className="form-row">
            <div className="form-group">
              <label>MCC</label>
              <input
                type="text"
                value={plmnConfig.mcc}
                minLength={3}
                maxLength={3}
                onChange={(e) => handlePlmnChange('mcc', e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label>MNC</label>
              <input
                type="text"
                value={plmnConfig.mnc}
                minLength={2}
                maxLength={3}
                onChange={(e) => handlePlmnChange('mnc', e.target.value)}
              />
            </div>
            
          </div>
            
          <div className="form-row">
            <div className="form-group">
              <label>absoluteFrequencySSB</label>
              <input
                type="text"
                value={plmnConfig.absoluteFrequencySSB}
                onChange={(e) => handlePlmnChange('absoluteFrequencySSB', e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label>dl_absoluteFrequencyPointA</label>
              <input
                type="text"
                value={plmnConfig.dl_absoluteFrequencyPointA}
                onChange={(e) => handlePlmnChange('dl_absoluteFrequencyPointA', e.target.value)}
              />
            </div>
          </div>
            
          <button className="button" disabled={saving} onClick={savePlmnConfig}>
            {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
            <span>Save PLMN Configuration</span>
          </button>
        </div>



        <div className="card">
          <h2>SIB8 Configuration</h2>

          <div className="form-row">
            <div className="form-group">
              <label>Message Identifier</label>
              <input
                value={sib8Config.messageIdentifier}
                minLength={4}
                maxLength={4}
                onChange={(e) => handleSib8Change('messageIdentifier', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Serial Number</label>
              <input
                value={sib8Config.serialNumber}
                minLength={4}
                maxLength={4}
                onChange={(e) => handleSib8Change('serialNumber', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Data Coding Scheme</label>
              <select
                value={sib8Config.dataCodingScheme}
                onChange={(e) => handleSib8Change('dataCodingScheme', e.target.value)}
              >
                <option value="48">UCS2</option>
                <option value="01">GSM 7-bit</option>
              </select>
            </div>

            <div className="form-group">
              <label>Mode</label>
                <select
                  value={sib8Config.mode}
                  onChange={(e) => handleSib8Change('mode', e.target.value)}
                >
                  <option value="0">Normal (single warning)</option>
                  <option value="1">Multi warning messages</option>
                  <option value="2">Multi messages (2 segments each)</option>
                </select>
            </div>
          </div>

          <div className="form-group">
            <label>Message Text</label>
            <textarea
              value={sib8Config.text}
              onChange={(e) => handleSib8Change('text', e.target.value)}
              rows="4"
            />
          </div>

          <button className="button" disabled={saving} onClick={saveSib8Config}>
            {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
            <span>Save SIB8 Configuration</span>
          </button>

          {/* <button className="button" disabled={saving} onClick={disableSib8}>
            {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
            <span>Save SIB8 Configuration</span>
          </button> */}

        </div>
      </div>
    </div>
  );

  const renderSimCardsPage = () => (
    <div className="page">
      <h1>SIM Cards</h1>
      <p className="subtitle">Manage SIM cards and subscribers in OAI</p>
      {message.text && (
        <div className={`alert ${message.type}`}>
          {message.type === 'success'
            ? <CheckCircle size={20} />
            : <AlertCircle size={20} />
          }
          <span>{message.text}</span>
        </div>
      )}

      <div className="stack" >
        <div className="card" style={{ width: '1200px' }}>
          <h2>Existing Subscribers</h2>

          {subsLoading ? (
            <p>Loading subscribers...</p>
          ) : subscribers.length === 0 ? (
            <p>No subscribers found.</p>
          ) : (
            <table className="simple-table">
            <thead>
              <tr>
                <th>IMSI</th>
                <th>encPermanentKey</th>
                <th>encOpcKey</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map(sub => (
                <tr key={sub.ueid}>
                  <td>{sub.ueid}</td>
                  <td>{sub.encPermanentKey}</td>
                  <td>{sub.encOpcKey}</td>
                  <td>
                    <button
                      className="small-button"
                      style={{color : 'black'}}
                      onClick={() => startEditSubscriber(sub)}
                    >
                      Edit
                    </button>
                    <button
                      className="small-button danger"
                      onClick={() => deleteSubscriber(sub.ueid)}
                      style={{ marginLeft: '6px' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Add Subscriber</h2>

          <div className="form-group">
            <label>UEID / SUPI</label>
            <input
              value={newSubscriber.ueid}
              onChange={e => handleNewSubscriberChange('ueid', e.target.value)}
              placeholder="e.g. 001010000059460"
            />
          </div>

          <div className="form-group">
            <label>encPermanentKey</label>
            <input
              value={newSubscriber.encPermanentKey}
              onChange={e => handleNewSubscriberChange('encPermanentKey', e.target.value)}
              placeholder="Leave empty to use default K"
            />
          </div>

          <div className="form-group">
            <label>encOpcKey</label>
            <input
              value={newSubscriber.encOpcKey}
              onChange={e => handleNewSubscriberChange('encOpcKey', e.target.value)}
              placeholder="Leave empty to use default OPC"
            />
          </div>

          <button className="button" disabled={saving} onClick={addSubscriber}>
            {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
            <span>Add Subscriber</span>
          </button>
        </div>

        {editingSubscriber && (
            <div className="card">
              <h2>Edit Subscriber</h2>

              <div className="form-group">
                <label>UEID / SUPI</label>
                <input
                  value={editingSubscriber.ueid}
                  onChange={e => handleEditSubscriberChange('ueid', e.target.value)}
                  placeholder="Leave empty to keep current"
                />
              </div>

              <div className="form-group">
                <label>encPermanentKey</label>
                <input
                  value={editingSubscriber.encPermanentKey}
                  onChange={e => handleEditSubscriberChange('encPermanentKey', e.target.value)}
                  placeholder="Leave empty to keep current"
                />
              </div>

              <div className="form-group">
                <label>encOpcKey</label>
                <input
                  value={editingSubscriber.encOpcKey}
                  onChange={e => handleEditSubscriberChange('encOpcKey', e.target.value)}
                  placeholder="Leave empty to keep current"
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="button"
                  disabled={saving}
                  onClick={saveEditedSubscriber}
                >
                  {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>Save Changes</span>
                </button>

                <button
                  className="button secondary"
                  type="button"
                  onClick={cancelEditSubscriber}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

      </div>
    </div>
  );


  return (
    <div className="app-shell">
      <aside className="sidebar">

        <h1 style={{marginTop : '5px', fontSize : '20px'}}>Network Management</h1>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activePage === 'config' ? 'active' : ''}`}
            onClick={() => setActivePage('config')}
          >
            Configuration
          </button>
          <button
            className={`nav-item ${activePage === 'sim' ? 'active' : ''}`}
            onClick={() => setActivePage('sim')}
          >
            SIM Cards
          </button>
        </nav>
      </aside>

      {activePage === 'config' ? renderConfigPage() : renderSimCardsPage()}

    </div>
  );
}
