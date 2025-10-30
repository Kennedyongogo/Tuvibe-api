const natural = require('natural');
const fs = require('fs');
const path = require('path');

// Initialize the tokenizer and stemmer
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Training data for Mwalimu Hope Foundation
const trainingData = {
  questions: [
    // Donation related
    "How can I donate to the foundation?",
    "What are the donation methods?",
    "How do I make a donation?",
    "Can I donate online?",
    "What payment methods do you accept?",
    "How can I contribute financially?",
    "Is my donation tax deductible?",
    "Can I set up recurring donations?",
    "How are donations used?",
    "What percentage goes to programs?",
    "Are donations tax exempt?",
    "How can I track my donation?",
    
    // Programs and services
    "What programs do you offer?",
    "What services do you provide?",
    "What education programs do you have?",
    "Tell me about your mental health programs",
    "What community projects are you running?",
    "How do you help with poverty alleviation?",
    "What support do you offer to students?",
    "Do you provide counseling services?",
    "What healthcare initiatives do you have?",
    "How do you promote preventive healthcare?",
    "What economic empowerment programs exist?",
    "Do you offer vocational training?",
    "What community development projects?",
    "How do you support underprivileged learners?",
    
    // Volunteering
    "How can I volunteer?",
    "What volunteer opportunities are available?",
    "How do I become a volunteer?",
    "What skills do you need from volunteers?",
    "Can I volunteer remotely?",
    "What is the volunteer commitment?",
    "How do I apply to volunteer?",
    "What volunteer roles exist?",
    "Can I volunteer in education programs?",
    "How can I help with mental health awareness?",
    "What community outreach can I join?",
    
    // Mission, vision, and objectives
    "What is your mission?",
    "What is your vision?",
    "What does Mwalimu Hope Foundation do?",
    "What is the foundation about?",
    "Tell me about your organization",
    "What are your goals?",
    "What impact do you make?",
    "What are your main objectives?",
    "How do you promote education access?",
    "What mental health support do you provide?",
    "How do you reduce poverty?",
    "What healthcare initiatives do you run?",
    "How do you mobilize resources?",
    "Do you collaborate with government?",
    
    // Location and contact
    "Where are you located?",
    "What is your address?",
    "How can I contact you?",
    "What is your phone number?",
    "What is your email address?",
    "Where is your office?",
    "How do I reach you?",
    "What is your postal address?",
    "Where is Meghon Plaza?",
    "How do I find your office?",
    "What is your physical location?",
    
    // Membership and partnership
    "How can I become a member?",
    "How do I join the foundation?",
    "Can I partner with you?",
    "How can organizations collaborate?",
    "What are the membership benefits?",
    "How do I get involved?",
    "What are member rights?",
    "What are member duties?",
    "How do I support the foundation?",
    "Can I be an advisor?",
    "How do I become a board member?",
    "What is the membership process?",
    
    // Governance and structure
    "Who runs the foundation?",
    "What is your governance structure?",
    "Who is on the board?",
    "How is the foundation managed?",
    "Who is the CEO?",
    "What is the leadership structure?",
    "How are decisions made?",
    "Who can I speak to about partnerships?",
    "How is the foundation organized?",
    "What are the board positions?",
    
    // Values and principles
    "What are your values?",
    "What principles guide you?",
    "How do you ensure integrity?",
    "What is your accountability policy?",
    "How do you promote inclusivity?",
    "What professional standards do you follow?",
    "How do you serve humanity?",
    "What ethical standards do you maintain?",
    
    // Events and activities
    "What events do you organize?",
    "When are your next events?",
    "How can I attend your events?",
    "Do you have upcoming activities?",
    "What workshops do you offer?",
    "Are your events free?",
    "When is your AGM?",
    "How often do you have board meetings?",
    "What community events do you host?",
    "Do you have annual meetings?",
    
    // Financial and transparency
    "How is the foundation funded?",
    "Where do your funds come from?",
    "How are funds utilized?",
    "What are authorized expenses?",
    "Are your accounts audited?",
    "How do you ensure financial transparency?",
    "What financial reports do you provide?",
    "How are funds managed?",
    "What are operational costs?",
    "How much goes to programs?",
    
    // Legal and compliance
    "Are you registered in Kenya?",
    "What is your legal status?",
    "Are you a non-profit organization?",
    "Is the foundation non-political?",
    "Are you non-sectarian?",
    "What laws govern the foundation?",
    "How do you handle disputes?",
    "What is your dispute resolution process?",
    "How are conflicts resolved?",
    "What legal protections exist?",
    
    // Leadership and team
    "Who are the officials?",
    "Who is the CEO?",
    "Who is the secretary?",
    "Who is the advisor?",
    "Who are the board members?",
    "How can I contact the CEO?",
    "How can I contact the secretary?",
    "How can I contact the advisor?",
    "What are the officials' qualifications?",
    "Who is Simiyu Leviticus?",
    "Who is Anjeline Nafula Juma?",
    "Who is Dr. Mbiti Mwondi?",
    
    // Registration and legal status
    "Are you registered?",
    "What is your registration status?",
    "Where are you registered?",
    "What documents are required for registration?",
    "Who is your registration authority?",
    "What is your registration number?",
    "Are you legally registered in Kenya?",
    "What is your NGO status?",
    "How do I verify your registration?",
    "What is your official status?",
    
    // General information
    "Who founded the foundation?",
    "When was the foundation established?",
    "How long have you been operating?",
    "What areas do you serve?",
    "Do you work in other counties?",
    "What is your success rate?",
    "How many people have you helped?",
    "What are your achievements?",
    "What is your track record?",
    "How effective are your programs?",
    "What impact have you made?",
    "What are your success stories?"
  ],
  
  intents: [
    // Donation related (12 questions)
    "donation", "donation", "donation", "donation", "donation", "donation", "donation", "donation", "donation", "donation", "donation", "donation",
    
    // Programs and services (14 questions)
    "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs", "programs",
    
    // Volunteering (11 questions)
    "volunteer", "volunteer", "volunteer", "volunteer", "volunteer", "volunteer", "volunteer", "volunteer", "volunteer", "volunteer", "volunteer",
    
    // Mission, vision, and objectives (14 questions)
    "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission", "mission",
    
    // Location and contact (11 questions)
    "location", "location", "location", "location", "location", "location", "location", "location", "location", "location", "location",
    
    // Membership and partnership (12 questions)
    "membership", "membership", "membership", "membership", "membership", "membership", "membership", "membership", "membership", "membership", "membership", "membership",
    
    // Governance and structure (10 questions)
    "governance", "governance", "governance", "governance", "governance", "governance", "governance", "governance", "governance", "governance",
    
    // Values and principles (8 questions)
    "values", "values", "values", "values", "values", "values", "values", "values",
    
    // Events and activities (10 questions)
    "events", "events", "events", "events", "events", "events", "events", "events", "events", "events",
    
    // Financial and transparency (10 questions)
    "financial", "financial", "financial", "financial", "financial", "financial", "financial", "financial", "financial", "financial",
    
    // Legal and compliance (10 questions)
    "legal", "legal", "legal", "legal", "legal", "legal", "legal", "legal", "legal", "legal",
    
    // Leadership and team (12 questions)
    "leadership", "leadership", "leadership", "leadership", "leadership", "leadership", "leadership", "leadership", "leadership", "leadership", "leadership", "leadership",
    
    // Registration and legal status (10 questions)
    "registration", "registration", "registration", "registration", "registration", "registration", "registration", "registration", "registration", "registration",
    
    // General information (12 questions)
    "general", "general", "general", "general", "general", "general", "general", "general", "general", "general", "general", "general"
  ],
  
  responses: {
    donation: "**Support Mwalimu Hope Foundation:**\n\n💰 **Donation Methods:**\n• Mobile Money: 0721660901\n• Bank Transfer: Contact us for details\n• Online: Visit our website\n• In-person: Meghon Plaza, Bungoma Town\n\n📊 **How Donations Are Used:**\n• Education programs for underprivileged learners\n• Mental health awareness and support\n• Poverty reduction initiatives\n• Healthcare programs\n• Community development projects\n\n✅ **Financial Transparency:**\n• All funds are banked and audited annually\n• Authorized expenses include operational costs and welfare activities\n• Regular financial reports available\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    programs: "**Mwalimu Hope Foundation Programs:**\n\n🎓 **Education Initiatives:**\n• Promote access to quality education for underprivileged learners\n• Provide scholarships and learning resources\n• Educational workshops and training programs\n\n🧠 **Mental Health & Healthcare:**\n• Raise awareness about mental health and psychosocial well-being\n• Provide counseling and support services\n• Promote preventive and curative healthcare initiatives\n• Community health awareness campaigns\n\n🏘️ **Community Development:**\n• Implement poverty reduction and economic empowerment initiatives\n• Mobilize resources for community development projects\n• Vocational training and skills development\n• Infrastructure development projects\n\n🤝 **Collaboration:**\n• Partner with government and other organizations\n• Community outreach and engagement\n• Sustainable development initiatives\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    volunteer: "**Volunteer with Mwalimu Hope Foundation:**\n\n🤝 **Volunteer Opportunities:**\n• Education program support and tutoring\n• Mental health awareness campaigns\n• Community outreach and engagement\n• Healthcare initiatives and health drives\n• Administrative and organizational support\n• Event planning and management\n• Fundraising and resource mobilization\n\n📋 **How to Apply:**\n1. Contact us at simiyuleviticus93@gmail.com\n2. Specify your area of interest and skills\n3. Attend an orientation session\n4. Start making a difference in your community!\n\n🎯 **Volunteer Benefits:**\n• Gain valuable experience in community development\n• Network with like-minded individuals\n• Make a real impact in people's lives\n• Develop new skills and knowledge\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    mission: "**Mwalimu Hope Foundation:**\n\n🌟 **Our Vision:**\nTo create a society where every individual has access to education, mental health support, and sustainable livelihoods.\n\n🎯 **Our Mission:**\nTo empower communities through education, health advocacy, and poverty alleviation programs for sustainable development.\n\n📋 **Core Objectives:**\n1. Promote access to quality education for underprivileged learners\n2. Raise awareness and provide support for mental health and psychosocial well-being\n3. Implement poverty reduction and economic empowerment initiatives\n4. Promote preventive and curative healthcare initiatives\n5. Mobilize resources for community development projects\n6. Collaborate with government and other organizations for sustainable development\n\n🏢 **Status:** Non-political, non-profit, and non-sectarian charitable organization registered under the laws of Kenya\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    location: "**Mwalimu Hope Foundation Location:**\n\n🏢 **Physical Address:**\nMeghon Plaza, Bungoma Town\nAlong Moi Avenue\n\n📮 **Postal Address:**\nP.O. Box 2072-50200\nBungoma, Kenya\n\n📧 **Email:**\nsimiyuleviticus93@gmail.com\n\n📞 **Contact Numbers:**\n• CEO/Founder: 0721660901\n• Secretary: 0792480017\n• Advisor: 0727085726\n\n🗺️ **How to Find Us:**\nLocated in the heart of Bungoma Town at Meghon Plaza, easily accessible along Moi Avenue. Our office is open for visits and consultations.\n\n🕒 **Office Hours:**\nMonday - Friday: 8:00 AM - 5:00 PM\nSaturday: 9:00 AM - 1:00 PM",
    
    membership: "**Join Mwalimu Hope Foundation:**\n\n👥 **Membership Details:**\n• Open to any person who supports the objectives of the Foundation\n• No discrimination based on background or affiliation\n\n✅ **Member Rights:**\n• Participation in Foundation activities\n• Voting rights in decision-making\n• Access to Foundation reports and updates\n• Networking opportunities\n• Direct impact on community programs\n\n📋 **Member Duties:**\n• Uphold the Foundation Constitution\n• Support Foundation objectives and activities\n• Act in the best interest of the Foundation\n• Maintain integrity and professionalism\n\n📝 **How to Join:**\n1. Contact us at simiyuleviticus93@gmail.com\n2. Express your interest in joining\n3. Complete the membership process\n4. Attend orientation and start contributing!\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    governance: "**Mwalimu Hope Foundation Governance:**\n\n🏛️ **Board Structure:**\n• Chief Executive Officer (CEO)/Founder\n• Secretary\n• Treasurer\n• Two Board Members\n• Advisors (non-voting)\n\n⏰ **Tenure:**\n• Officials serve for three (3) years\n• Renewable upon re-election\n\n📅 **Meetings:**\n• Annual General Meeting (AGM) - held annually\n• Board Meetings - held quarterly\n• Quorum: two-thirds of members required\n\n🤝 **Decision Making:**\n• Democratic process with member participation\n• Two-thirds majority for major decisions\n• Transparent and accountable governance\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    values: "**Mwalimu Hope Foundation Values:**\n\n🎯 **Core Values:**\n• **Integrity** - Honest and ethical in all dealings\n• **Accountability** - Transparent and responsible to stakeholders\n• **Inclusivity** - Open to all regardless of background\n• **Professionalism** - High standards in all activities\n• **Service to Humanity** - Dedicated to helping others\n\n📋 **Principles:**\n• Non-political, non-profit, and non-sectarian\n• Committed to sustainable development\n• Focused on community empowerment\n• Transparent and accountable operations\n• Collaborative approach with partners\n\n🌟 **Commitment:**\nAll members commit to uphold the Constitution and act in the best interest of the Foundation.\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    events: "**Mwalimu Hope Foundation Events:**\n\n📅 **Regular Meetings:**\n• Annual General Meeting (AGM) - held annually\n• Board Meetings - held quarterly\n• Community engagement sessions\n\n🎯 **Program Events:**\n• Educational workshops and training\n• Mental health awareness campaigns\n• Healthcare initiatives and health drives\n• Community development activities\n• Fundraising events\n• Scholarship award ceremonies\n\n📋 **Event Information:**\n• Most events are open to the public\n• Some events may require registration\n• Community events are often free\n• Special events may have nominal fees\n\n📞 **For Event Details:**\nContact: simiyuleviticus93@gmail.com\nPhone: 0721660901",
    
    financial: "**Mwalimu Hope Foundation Finances:**\n\n💰 **Funding Sources:**\n• Donations from individuals and organizations\n• Grants from government and international bodies\n• Fundraising activities and events\n• Community contributions\n\n📊 **Fund Utilization:**\n• Remuneration and allowances for executive leaders\n• Operational costs and administrative expenses\n• Welfare activities and community programs\n• Education and healthcare initiatives\n• Poverty alleviation projects\n\n✅ **Financial Management:**\n• All funds are properly banked\n• Annual audits conducted\n• Transparent financial reporting\n• Accountable use of resources\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    legal: "**Mwalimu Hope Foundation Legal Status:**\n\n📜 **Registration:**\n• Registered under the laws of Kenya\n• Non-political, non-profit, and non-sectarian\n• Charitable organization status\n\n⚖️ **Legal Framework:**\n• Governed by Kenyan law\n• Compliant with all regulations\n• Transparent operations\n\n🤝 **Dispute Resolution:**\n1. **Negotiation** - First step in conflict resolution\n2. **Mediation** - Third-party facilitated discussions\n3. **Arbitration** - Formal dispute resolution process\n4. **Court** - Last resort for unresolved disputes\n\n🛡️ **Legal Protection:**\n• Officials protected from liability for good faith actions\n• Foundation assumes liability for authorized obligations\n• Clear legal framework for operations\n\n📞 **Contact:** simiyuleviticus93@gmail.com",
    
    leadership: "**Mwalimu Hope Foundation Leadership Team:**\n\n👨‍💼 **CEO/Founder:**\n**Simiyu Leviticus**\n• ID: 32813494\n• Phone: 0721660901\n• Email: simiyuleviticus93@gmail.com\n• Role: Chief Executive Officer and Founder\n\n👩‍💼 **Secretary:**\n**Anjeline Nafula Juma**\n• ID: 33245059\n• Phone: 0792480017\n• Role: Secretary and Administrative Officer\n\n👨‍⚕️ **Advisor:**\n**Dr. Mbiti Mwondi**\n• Phone: 0727085726\n• Qualifications: Medical Doctor, Mental Health Advocate\n• Specialization: Psychiatric Resident (UoN), Public Health & Digital Health Expert\n• Role: Medical and Mental Health Advisor\n\n🏛️ **Board Structure:**\n• CEO/Founder (Simiyu Leviticus)\n• Secretary (Anjeline Nafula Juma)\n• Treasurer (To be appointed)\n• Two Board Members (To be appointed)\n• Advisors (Dr. Mbiti Mwondi and others)\n\n📞 **Contact Leadership:**\nFor specific inquiries, contact the relevant official directly using their phone numbers above.",
    
    registration: "**Mwalimu Hope Foundation Registration Status:**\n\n📋 **Registration Status:**\n• **Status**: Application submitted to NGO Coordination Board\n• **Authority**: NGO Coordination Board, Kenya\n• **Address**: P.O. Box 44617-00100, Nairobi, Kenya\n• **Registration Number**: Pending (will be assigned upon approval)\n\n📄 **Registration Process:**\n• Application submitted for charitable foundation registration\n• Operating as non-profit organization\n• Focus: Education, mental health awareness, poverty alleviation, community empowerment\n• Target: Vulnerable groups and sustainable development\n\n📋 **Required Documents Submitted:**\n✅ Proposed constitution of the foundation\n✅ List of proposed officials with ID copies and passport photos\n✅ Minutes of the meeting resolving to register the foundation\n✅ Proposed organizational structure\n✅ Physical and postal address details\n\n🏢 **Official Status:**\n• Non-political, non-profit, and non-sectarian\n• Charitable foundation under Kenyan law\n• Application under review by NGO Coordination Board\n\n📞 **Verification:**\nContact NGO Coordination Board for official verification of registration status.",
    
    general: "**About Mwalimu Hope Foundation:**\n\n🏛️ **Organization:**\nMwalimu Hope Foundation is a charitable foundation established to champion education, mental health awareness, poverty alleviation, and community empowerment initiatives in Kenya.\n\n📅 **Established:**\nConstitution adopted on 25th August 2025 at Bungoma Town\n\n🎯 **Focus Areas:**\n• Education for underprivileged learners\n• Mental health awareness and support\n• Poverty reduction and economic empowerment\n• Healthcare initiatives\n• Community development\n• Resource mobilization\n\n🌍 **Service Area:**\nPrimarily Bungoma County with expanding reach to neighboring areas\n\n📞 **Contact:**\nsimiyuleviticus93@gmail.com\nPhone: 0721660901\nAddress: Meghon Plaza, Bungoma Town"
  }
};

// Simple TF-IDF implementation
class SimpleTFIDF {
  constructor() {
    this.documents = [];
    this.vocabulary = new Set();
    this.idf = {};
    this.tf = [];
  }

  addDocument(doc) {
    const tokens = this.tokenize(doc);
    this.documents.push(tokens);
    tokens.forEach(token => this.vocabulary.add(token));
  }

  tokenize(text) {
    return tokenizer.tokenize(text.toLowerCase())
      .map(token => stemmer.stem(token))
      .filter(token => token.length > 2);
  }

  calculateTFIDF() {
    // Calculate TF for each document
    this.tf = this.documents.map(doc => {
      const tf = {};
      doc.forEach(token => {
        tf[token] = (tf[token] || 0) + 1;
      });
      // Normalize by document length
      Object.keys(tf).forEach(token => {
        tf[token] = tf[token] / doc.length;
      });
      return tf;
    });

    // Calculate IDF
    this.vocabulary.forEach(token => {
      let docCount = 0;
      this.documents.forEach(doc => {
        if (doc.includes(token)) docCount++;
      });
      this.idf[token] = Math.log(this.documents.length / docCount);
    });
  }

  getVector(text) {
    const tokens = this.tokenize(text);
    const vector = {};
    
    tokens.forEach(token => {
      if (this.vocabulary.has(token)) {
        const tf = tokens.filter(t => t === token).length / tokens.length;
        const tfidf = tf * (this.idf[token] || 0);
        vector[token] = tfidf;
      }
    });
    
    return vector;
  }

  cosineSimilarity(vec1, vec2) {
    const keys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    keys.forEach(key => {
      const val1 = vec1[key] || 0;
      const val2 = vec2[key] || 0;
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    });

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

// Initialize the chatbot
let tfidf = null;
let documentVectors = [];

const initializeChatbot = () => {
  try {
    console.log("🤖 Initializing chatbot...");
    
    tfidf = new SimpleTFIDF();
    
    // Add all training documents
    trainingData.questions.forEach(question => {
      tfidf.addDocument(question);
    });
    
    // Calculate TF-IDF
    tfidf.calculateTFIDF();
    
    // Pre-calculate document vectors
    documentVectors = trainingData.questions.map(question => 
      tfidf.getVector(question)
    );
    
    console.log("✅ Chatbot initialized successfully");
    console.log(`📊 Vocabulary size: ${tfidf.vocabulary.size}`);
    console.log(`📊 Training documents: ${trainingData.questions.length}`);
    
    return true;
  } catch (error) {
    console.error("❌ Error initializing chatbot:", error);
    return false;
  }
};

// Chat function
const processChatMessage = (message) => {
  try {
    if (!tfidf) {
      throw new Error("Chatbot not initialized");
    }

    const userVector = tfidf.getVector(message);
    let bestMatch = -1;
    let bestScore = 0;

    // Find the most similar training question
    documentVectors.forEach((docVector, index) => {
      const similarity = tfidf.cosineSimilarity(userVector, docVector);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = index;
      }
    });

    // Get the intent and response
    const intent = trainingData.intents[bestMatch];
    const response = trainingData.responses[intent] || trainingData.responses.general;

    return {
      reply: response,
      intent: intent,
      confidence: bestScore,
      success: true
    };
  } catch (error) {
    console.error("❌ Error processing chat message:", error);
    return {
      reply: "I'm sorry, I'm having trouble understanding right now. Please contact us directly at mwalimuhopefoundation@gmail.com or call 0721660901.",
      intent: "error",
      confidence: 0,
      success: false,
      error: error.message
    };
  }
};

// Controller functions
const chat = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message is required and must be a non-empty string"
      });
    }

    console.log(`💬 Chat request: "${message}"`);

    const result = processChatMessage(message.trim());
    
    console.log(`🤖 Response: ${result.intent} (confidence: ${result.confidence.toFixed(3)})`);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("❌ Chat controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getChatbotStatus = async (req, res) => {
  try {
    const isInitialized = tfidf !== null;
    const vocabularySize = tfidf ? tfidf.vocabulary.size : 0;
    const trainingDocs = trainingData.questions.length;

    res.status(200).json({
      success: true,
      data: {
        initialized: isInitialized,
        vocabularySize,
        trainingDocuments: trainingDocs,
        availableIntents: Object.keys(trainingData.responses),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Status controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const initializeChatbotEndpoint = async (req, res) => {
  try {
    const success = initializeChatbot();
    
    if (success) {
      res.status(200).json({
        success: true,
        message: "Chatbot initialized successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to initialize chatbot"
      });
    }

  } catch (error) {
    console.error("❌ Initialize controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  chat,
  getChatbotStatus,
  initializeChatbotEndpoint,
  initializeChatbot,
  processChatMessage
};
