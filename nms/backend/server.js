const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const PLMN_CONFIG_PATH = process.env.PLMN_CONFIG_PATH || path.join(
  process.env.HOME,
  '/openairinterface5g/targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf'
);
const CN_CONFIG_PATH = process.env.CN_CONFIG_PATH || path.join(
  process.env.HOME,
  '/oai-cn5g/conf/config.yaml'
);

const SIB8_CONFIG_PATH = process.env.SIB8_CONFIG_PATH || path.join(
  process.env.HOME,
  '/openairinterface5g/sib8.conf'
);


const db = mysql.createPool({
  host: process.env.DB_HOST || 'mysql', 
  user: process.env.DB_USER || 'test',
  password: process.env.DB_PASSWORD || 'test',
  database: process.env.DB_NAME || 'oai_db'
});

(async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Connected to MySQL');
  } catch (err) {
    console.error('❌ Failed to connect to MySQL:', err.message);
  }
})();

function parsePlmnConfig(content) {
  const config = {
    gNB_ID: '',
    tracking_area_code: '',
    mcc: '',
    mnc: '',
    mnc_length: '',
    nr_cellid: '',
    physCellId: '',
    absoluteFrequencySSB: '',
    dl_absoluteFrequencyPointA: ''
  };

  const gNB_ID_match = content.match(/gNB_ID\s*=\s*([^;]+);/);
  if (gNB_ID_match) config.gNB_ID = gNB_ID_match[1].trim();

  const tac_match = content.match(/tracking_area_code\s*=\s*([^;]+);/);
  if (tac_match) config.tracking_area_code = tac_match[1].trim();

  const mcc_match = content.match(/mcc\s*=\s*(\d+)/);
  if (mcc_match) config.mcc = mcc_match[1];

  const mnc_match = content.match(/mnc\s*=\s*(\d+)/);
  if (mnc_match) config.mnc = mnc_match[1];

  const mnc_length_match = content.match(/mnc_length\s*=\s*(\d+)/);
  if (mnc_length_match) config.mnc_length = mnc_length_match[1];

  const nrcellid_match = content.match(/nr_cellid\s*=\s*([^;]+);/);
  if (nrcellid_match) config.nr_cellid = nrcellid_match[1].trim();

  const pci_match = content.match(/physCellId\s*=\s*([^;]+);/);
  if (pci_match) config.physCellId = pci_match[1].trim();

  const afssb_match = content.match(/absoluteFrequencySSB\s*=\s*([^;]+);/);
  if (afssb_match) config.absoluteFrequencySSB = afssb_match[1].trim();

  const pointA_match = content.match(/dl_absoluteFrequencyPointA\s*=\s*([^;]+);/);
  if (pointA_match) config.dl_absoluteFrequencyPointA = pointA_match[1].trim();

  return config;
}
function parseSib8Config(content) {
  const config = {
    messageIdentifier: '',
    serialNumber: '',
    dataCodingScheme: '',
    text: '',
    mode: ''
  };

  const lines = content.split('\n');

  lines.forEach(line => {
    const index = line.indexOf('=');
    if (index === -1) return;

    const key = line.substring(0, index).trim();
    const value = line.substring(index + 1).replace(';','').trim();

    if (config.hasOwnProperty(key)) {
      if (key === "text") {
        config[key] = value.replace(/\|/g, "\n");
      } else {
        config[key] = value;
      }
    }
  });

  return config;
}


function writeCnConfig(originalContent, newConfig) {
  let content = originalContent;

  const mcc = newConfig.mcc;
  const mnc = newConfig.mnc;
  const tacHex = '0x' + Number(newConfig.tracking_area_code).toString(16).padStart(4, '0');

  content = content.replace(
    /mcc:\s*\d+/g,
    `mcc: ${mcc}`
  );

  content = content.replace(
    /mnc:\s*\d+/g,
    `mnc: ${mnc}`
  );

  content = content.replace(
    /tac:\s*(0x[0-9a-fA-F]+|\d+)/g,
    `tac: ${tacHex}`
  );

  return content;
}
function writePlmnConfig(originalContent, newConfig) {
  let content = originalContent;

  if (!/^\d{3}$/.test(newConfig.mcc)) {
    throw new Error("Invalid MCC: must be exactly 3 digits");
  }
  if (!/^\d{2,3}$/.test(newConfig.mnc)) {
    throw new Error("Invalid MNC: must be 2 or 3 digits");
  }

  content = content.replace(
    /gNB_ID\s*=\s*[^;]+;/,
    `gNB_ID    =  ${newConfig.gNB_ID};`
  );

  content = content.replace(
    /tracking_area_code\s*=\s*[^;]+;/,
    `tracking_area_code  =  ${newConfig.tracking_area_code};`
  );

  content = content.replace(
    /mcc\s*=\s*\d+/,
    `mcc = ${newConfig.mcc}`
  );

  content = content.replace(
    /mnc\s*=\s*\d+/,
    `mnc = ${newConfig.mnc}`
  );

  content = content.replace(
    /mnc_length\s*=\s*\d+/,
    `mnc_length = ${String(newConfig.mnc.length)}`
  );


  if (newConfig.nr_cellid !== undefined) {
    content = content.replace(
      /nr_cellid\s*=\s*[^;]+;/,
      `nr_cellid = ${newConfig.nr_cellid};`
    );
  }

  if (newConfig.physCellId !== undefined) {
    content = content.replace(
      /physCellId\s*=\s*[^;]+;/,
      `physCellId                                                    = ${newConfig.physCellId};`
    );
  }

  if (newConfig.absoluteFrequencySSB !== undefined) {
    content = content.replace(
      /absoluteFrequencySSB\s*=\s*[^;]+;/,
      `absoluteFrequencySSB                                             = ${newConfig.absoluteFrequencySSB};`
    );
  }

  if (newConfig.dl_absoluteFrequencyPointA !== undefined) {
    content = content.replace(
      /dl_absoluteFrequencyPointA\s*=\s*[^;]+;/,
      `dl_absoluteFrequencyPointA                                       = ${newConfig.dl_absoluteFrequencyPointA};`
    );
  }

  return content;
}
function writeSib8Config(config) {
  const safeText = config.text.replace(/\n/g, "|");

  return `messageIdentifier=${config.messageIdentifier};
serialNumber=${config.serialNumber};
dataCodingScheme=${config.dataCodingScheme};
text=${safeText};
mode=${config.mode};
`;
}



app.get('/api/plmn', async (req, res) => {
  try {
    const content = await fs.readFile(PLMN_CONFIG_PATH, 'utf8');
    const config = parsePlmnConfig(content);
    res.json(config);
  } catch (error) {
    console.error('Error reading PLMN config:', error);
    res.status(500).json({ error: 'Failed to read PLMN configuration' });
  }
});

app.post('/api/plmn', async (req, res) => {
  try {
    const originalContent = await fs.readFile(PLMN_CONFIG_PATH, 'utf8');
    const newContent = writePlmnConfig(originalContent, req.body);
    await fs.writeFile(PLMN_CONFIG_PATH, newContent, 'utf8');

    const cnOriginal = await fs.readFile(CN_CONFIG_PATH, 'utf8');
    const cnNew = writeCnConfig(cnOriginal, req.body);
    await fs.writeFile(CN_CONFIG_PATH, cnNew, 'utf8');

    res.json({ success: true, message: 'PLMN configuration saved' });
  } catch (error) {
    console.error('Error writing PLMN config:', error);
    res.status(500).json({ error: 'Failed to save PLMN configuration' });
  }
});

app.get('/api/sib8', async (req, res) => {
  try {
    const content = await fs.readFile(SIB8_CONFIG_PATH, 'utf8');
    const config = parseSib8Config(content);
    res.json(config);
  } catch (error) {
    console.error('Error reading SIB8 config:', error);
    res.status(500).json({ error: 'Failed to read SIB8 configuration' });
  }
});

app.post('/api/sib8', async (req, res) => {
  try {
    const newContent = writeSib8Config(req.body);
    await fs.writeFile(SIB8_CONFIG_PATH, newContent, 'utf8');
    res.json({ success: true, message: 'SIB8 configuration saved' });
  } catch (error) {
    console.error('Error writing SIB8 config:', error);
    res.status(500).json({ error: 'Failed to save SIB8 configuration' });
  }
});

app.get('/api/subscribers', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT ueid, encPermanentKey, encOpcKey FROM AuthenticationSubscription ORDER BY ueid'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching subscribers:', err);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

app.post('/api/subscribers', async (req, res) => {
  try {
    let { ueid, encPermanentKey, encOpcKey } = req.body;

    if (!ueid) {
      return res.status(400).json({ error: 'ueid is required' });
    }

    const DEFAULT_K = '5686e601f3a1942d4c5cd262ba6b4b20';
    const DEFAULT_OPC = 'aeb1cabd8ed7a09b48d17eb3d8af172c';

    encPermanentKey = encPermanentKey || DEFAULT_K;
    encOpcKey = encOpcKey || DEFAULT_OPC;

    const authenticationMethod = '5G_AKA';
    const protectionParameterId = encPermanentKey;
    const sequenceNumber = JSON.stringify({
      sqn: '000000000000',
      sqnScheme: 'NON_TIME_BASED',
      lastIndexes: { ausf: 0 }
    });
    const authenticationManagementField = '8000';
    const algorithmId = 'milenage';

    await db.query(
      `INSERT INTO AuthenticationSubscription 
       (ueid, authenticationMethod, encPermanentKey, protectionParameterId, sequenceNumber,
        authenticationManagementField, algorithmId, encOpcKey, encTopcKey,
        vectorGenerationInHss, n5gcAuthMethod, rgAuthenticationInd, supi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
      [
        ueid,
        authenticationMethod,
        encPermanentKey,
        protectionParameterId,
        sequenceNumber,
        authenticationManagementField,
        algorithmId,
        encOpcKey,
        ueid
      ]
    );

    res.json({ success: true, message: 'Subscriber added' });
  } catch (err) {
    console.error('Error adding subscriber:', err);
    res.status(500).json({ error: 'Failed to add subscriber' });
  }
});


app.put('/api/subscribers/:ueid', async (req, res) => {
  const oldUeid = req.params.ueid;
  const { ueid: newUeid, encPermanentKey, encOpcKey } = req.body;

  if (!newUeid && !encPermanentKey && !encOpcKey) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  try {
    const fields = [];
    const values = [];

    if (newUeid) {
      fields.push('ueid = ?', 'supi = ?');
      values.push(newUeid, newUeid);
    }

    if (encPermanentKey) {
      fields.push('encPermanentKey = ?', 'protectionParameterId = ?');
      values.push(encPermanentKey, encPermanentKey);
    }

    if (encOpcKey) {
      fields.push('encOpcKey = ?');
      values.push(encOpcKey);
    }

    values.push(oldUeid);

    const [result] = await db.query(
      `UPDATE AuthenticationSubscription 
       SET ${fields.join(', ')} 
       WHERE ueid = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({ success: true, message: 'Subscriber updated' });
  } catch (err) {
    console.error('Error updating subscriber:', err);
    res.status(500).json({ error: 'Failed to update subscriber' });
  }
});


app.delete('/api/subscribers/:ueid', async (req, res) => {
  const { ueid } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM AuthenticationSubscription WHERE ueid = ?',
      [ueid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({ success: true, message: 'Subscriber deleted' });
  } catch (err) {
    console.error('Error deleting subscriber:', err);
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📁 PLMN config: ${PLMN_CONFIG_PATH}`);
  console.log(`📁 SIB8 config: ${SIB8_CONFIG_PATH}`);
});