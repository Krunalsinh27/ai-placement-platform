const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const {
  User,
  Student,
  Company,
  Drive,
  Application,
  Placement,
  College,
  JobRequirement,
  DriveRequest,
  Aspirant,
} = require('../models');

dotenv.config();

// Realistic First & Last names
const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Akash', 'Ananya', 'Aniket', 'Anushka', 'Aryan', 'Ayush',
  'Bhavya', 'Chaitanya', 'Deepak', 'Devansh', 'Diya', 'Divyansh', 'Gaurav',
  'Harsh', 'Isha', 'Ishaan', 'Jaya', 'Karan', 'Khushi', 'Kavya', 'Krish',
  'Madhav', 'Manish', 'Meera', 'Mohit', 'Neha', 'Nikhil', 'Nisha', 'Omkar',
  'Pooja', 'Pranav', 'Prerna', 'Rahul', 'Rhea', 'Rishabh', 'Rohan', 'Sakshi',
  'Sameer', 'Sanya', 'Sarthak', 'Shivam', 'Shreya', 'Siddharth', 'Sneha',
  'Soham', 'Tanmay', 'Tanvi', 'Tarun', 'Utkarsh', 'Vaishnavi', 'Varun',
  'Vidhi', 'Vikas', 'Yash', 'Zoya', 'Aditya', 'Abhishek', 'Aastha'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Gupta', 'Singh', 'Kumar', 'Joshi', 'Mehta',
  'Shah', 'Malhotra', 'Bhatia', 'Iyer', 'Reddy', 'Nair', 'Chopra', 'Saxena',
  'Deshmukh', 'Kulkarni', 'Agarwal', 'Mishra', 'Pandey', 'Dubey', 'Tiwari',
  'Rathore', 'Chauhan', 'Yadav', 'Rao', 'Bose', 'Mukherjee', 'Sen'
];

const SKILLS_POOL = [
  'JavaScript', 'React', 'Node.js', 'Python', 'Java', 'C++', 'SQL', 'MongoDB',
  'AWS', 'Docker', 'Machine Learning', 'Data Structures', 'Git', 'TypeScript',
  'Tailwind CSS', 'Express.js', 'Next.js', 'Spring Boot', 'Figma', 'Linux'
];

// 15 Companies
const COMPANIES_DATA = [
  {
    name: 'Tata Consultancy Services (TCS)',
    industry: 'IT Services & Consulting',
    website: 'https://www.tcs.com',
    description: 'Global leader in IT services, consulting, and business solutions.',
  },
  {
    name: 'Infosys',
    industry: 'IT Services & Consulting',
    website: 'https://www.infosys.com',
    description: 'Next-generation digital services and consulting multinational.',
  },
  {
    name: 'Wipro',
    industry: 'Technology & Cloud Solutions',
    website: 'https://www.wipro.com',
    description: 'Leading technology services and consulting company.',
  },
  {
    name: 'Accenture',
    industry: 'Management & Technology Consulting',
    website: 'https://www.accenture.com',
    description: 'Global professional services company with leading capabilities in digital, cloud, and security.',
  },
  {
    name: 'Cognizant',
    industry: 'Digital Engineering & IT',
    website: 'https://www.cognizant.com',
    description: 'Engineering modern businesses for the digital era.',
  },
  {
    name: 'Capgemini',
    industry: 'Consulting & Technology',
    website: 'https://www.capgemini.com',
    description: 'Global leader in partnering with companies to transform and manage their business.',
  },
  {
    name: 'Tech Mahindra',
    industry: 'Digital Transformation & Telecom',
    website: 'https://www.techmahindra.com',
    description: 'Specialists in digital transformation, consulting, and business re-engineering solutions.',
  },
  {
    name: 'HCL Technologies',
    industry: 'Enterprise Software & IT Services',
    website: 'https://www.hcltech.com',
    description: 'Global technology company supercharging digital transformation.',
  },
  {
    name: 'Google',
    industry: 'Internet & Cloud Technology',
    website: 'https://careers.google.com',
    description: 'Multinational technology company focusing on search, cloud, AI, and operating systems.',
  },
  {
    name: 'Microsoft',
    industry: 'Enterprise Cloud & Software',
    website: 'https://careers.microsoft.com',
    description: 'Global provider of computer software, consumer electronics, and cloud computing.',
  },
  {
    name: 'Amazon',
    industry: 'E-Commerce & AWS Cloud',
    website: 'https://amazon.jobs',
    description: 'Focuses on e-commerce, cloud computing, digital streaming, and artificial intelligence.',
  },
  {
    name: 'Larsen & Toubro (L&T)',
    industry: 'Engineering & Construction',
    website: 'https://www.larsentoubro.com',
    description: 'Major Indian multinational engaged in EPC projects, manufacturing, and tech services.',
  },
  {
    name: 'Tata Motors',
    industry: 'Automotive & Manufacturing',
    website: 'https://www.tatamotors.com',
    description: 'Leading global automobile manufacturer with a extensive portfolio of cars and commercial vehicles.',
  },
  {
    name: 'Deloitte',
    industry: 'Audit & Technology Advisory',
    website: 'https://www.deloitte.com',
    description: 'Industry-leading audit, consulting, tax, and advisory services.',
  },
  {
    name: 'Cisco Systems',
    industry: 'Networking & Cybersecurity',
    website: 'https://www.cisco.com',
    description: 'Worldwide technology leader in networking hardware and cybersecurity solutions.',
  },
];

const seedData = async () => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    console.error('REFUSING TO SEED DATABASE IN PRODUCTION: Set ALLOW_PRODUCTION_SEED=true to override.');
    process.exit(1);
  }
  try {
    const mongoUri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/placement_management';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB. Starting comprehensive database seed...\n');

    // 0. Seed Colleges (Every college will have >= 20 students)
    console.log('0. Seeding 4 Demo Colleges...');
    await College.deleteMany({});
    const college1 = await College.create({
      name: 'National Institute of Technology Delhi',
      code: 'NITD',
      city: 'New Delhi',
      state: 'Delhi',
      website: 'https://nitdelhi.ac.in',
      accreditation: 'NAAC A+ Accredited / NBA Tier-1',
      contactEmail: 'tpo@nitdelhi.ac.in',
      contactPhone: '+91-11-33861000',
      status: 'approved',
    });

    const college2 = await College.create({
      name: 'Pune Institute of Computer Technology',
      code: 'PICT',
      city: 'Pune',
      state: 'Maharashtra',
      website: 'https://pict.edu',
      accreditation: 'NAAC A++ Accredited / ISO 9001:2015',
      contactEmail: 'tpo@pict.edu',
      contactPhone: '+91-20-24371101',
      status: 'approved',
    });

    const college3 = await College.create({
      name: 'Indian Institute of Technology Bombay',
      code: 'IITB',
      city: 'Mumbai',
      state: 'Maharashtra',
      website: 'https://iitb.ac.in',
      accreditation: 'Institute of National Importance / NIRF #3',
      contactEmail: 'tpo@iitb.ac.in',
      contactPhone: '+91-22-25722545',
      status: 'approved',
    });

    const college4 = await College.create({
      name: 'Birla Institute of Technology and Science',
      code: 'BITS',
      city: 'Pilani',
      state: 'Rajasthan',
      website: 'https://bits-pilani.ac.in',
      accreditation: 'NAAC A Grade / Deemed University',
      contactEmail: 'tpo@bits-pilani.ac.in',
      contactPhone: '+91-1596-245073',
      status: 'approved',
    });

    const college5 = await College.create({
      name: 'LDRP Institute of Technology and Research',
      code: 'LDRP',
      city: 'Gandhinagar',
      state: 'Gujarat',
      website: 'https://www.ldrp.ac.in',
      accreditation: 'NAAC Accredited / KSV University',
      contactEmail: 'tpo@ldrp.ac.in',
      contactPhone: '+91-79-23241492',
      status: 'approved',
    });
    console.log(`Created 5 colleges: ${college1.code}, ${college2.code}, ${college3.code}, ${college4.code}, ${college5.code}`);

    // 1. Clean existing records (preserving/migrating admin accounts)
    console.log('1. Clearing existing student, drive, company, application, and placement records...');
    await Placement.deleteMany({});
    await Application.deleteMany({});
    await Drive.deleteMany({});
    await DriveRequest.deleteMany({});
    await JobRequirement.deleteMany({});
    await Company.deleteMany({});
    await Student.deleteMany({});
    await User.deleteMany({ role: 'student' });

    // Ensure TPO for College 1 (NITD) - default login admin@college.com
    const adminEmail = 'admin@college.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        name: 'NIT Delhi TPO Administrator',
        email: adminEmail,
        password: 'Falcon#2026!Secured',
        role: 'tpo',
        college: college1._id,
        isApproved: true,
        isEmailVerified: true,
      });
      console.log('Created default College 1 TPO: admin@college.com');
    } else {
      admin.role = 'tpo';
      admin.college = college1._id;
      admin.password = 'Falcon#2026!Secured';
      admin.isApproved = true;
      admin.isEmailVerified = true;
      await admin.save();
      console.log('Migrated existing admin to College 1 TPO (admin@college.com)');
    }

    // Ensure TPO for College 2 (PICT)
    const tpoPuneEmail = 'tpo.pict@college.com';
    let tpoPune = await User.findOne({ email: tpoPuneEmail });
    if (!tpoPune) {
      tpoPune = await User.create({
        name: 'PICT Pune TPO Administrator',
        email: tpoPuneEmail,
        password: 'Falcon#2026!Secured',
        role: 'tpo',
        college: college2._id,
        isApproved: true,
        isEmailVerified: true,
      });
      console.log('Created College 2 TPO: tpo.pict@college.com');
    } else {
      tpoPune.role = 'tpo';
      tpoPune.college = college2._id;
      tpoPune.password = 'Falcon#2026!Secured';
      tpoPune.isApproved = true;
      tpoPune.isEmailVerified = true;
      await tpoPune.save();
      console.log('Verified College 2 TPO: tpo.pict@college.com');
    }

    // 2. Insert 15 Companies
    console.log('2. Inserting 15 Recruiting Companies...');
    const createdCompanies = await Company.insertMany(COMPANIES_DATA);
    const companyMap = {};
    createdCompanies.forEach((c) => {
      companyMap[c.name] = c._id;
    });

    // Ensure default Recruiter user exists linked to Google
    const googleCompany = createdCompanies.find((c) => c.name === 'Google');
    const recruiterEmail = 'recruiter@google.com';
    let recruiterUser = await User.findOne({ email: recruiterEmail });
    if (!recruiterUser) {
      recruiterUser = await User.create({
        name: 'Google Campus Talent Partner',
        email: recruiterEmail,
        password: 'Vanguard#2026!Access',
        role: 'recruiter',
        company: googleCompany._id,
        isApproved: true,
        isEmailVerified: true,
      });
      googleCompany.owner = recruiterUser._id;
      googleCompany.verified = true;
      googleCompany.hrContact = {
        name: 'Google University Talent Lead',
        email: 'university-talent@google.com',
        phone: '+1-650-253-0000',
      };
      await googleCompany.save();
      console.log('Created default recruiter: recruiter@google.com (Google)');
    } else {
      recruiterUser.role = 'recruiter';
      recruiterUser.company = googleCompany._id;
      recruiterUser.password = 'Vanguard#2026!Access';
      recruiterUser.isApproved = true;
      recruiterUser.isEmailVerified = true;
      await recruiterUser.save();
    }

    // Ensure Superadmin exists in development seed
    const superadminEmail = 'superadmin@portal.com';
    let superadmin = await User.findOne({ email: superadminEmail });
    if (!superadmin) {
      await User.create({
        name: 'System Superadmin',
        email: superadminEmail,
        password: 'Apex#2026!Shielded',
        role: 'superadmin',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log('Created default Superadmin: superadmin@portal.com');
    } else {
      superadmin.role = 'superadmin';
      superadmin.password = 'Apex#2026!Shielded';
      superadmin.isApproved = true;
      superadmin.isEmailVerified = true;
      await superadmin.save();
      console.log('Verified Superadmin account: superadmin@portal.com');
    }

    // Ensure Approved Analyst exists in development seed
    const analystEmail = 'analyst@portal.com';
    let analyst = await User.findOne({ email: analystEmail });
    if (!analyst) {
      await User.create({
        name: 'Chief Higher Education Analyst',
        email: analystEmail,
        password: 'Horizon#2026!Metric',
        role: 'analyst',
        organisation: 'Higher Education Analytics Board',
        organisationType: 'Accreditation body',
        purpose: 'Institutional accreditation benchmarking & national recruitment trends analysis',
        designation: 'Senior Placement Analyst',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log('Created default Analyst: analyst@portal.com');
    } else {
      analyst.role = 'analyst';
      analyst.password = 'Horizon#2026!Metric';
      analyst.organisation = 'Higher Education Analytics Board';
      analyst.organisationType = 'Accreditation body';
      analyst.purpose = 'Institutional accreditation benchmarking & national recruitment trends analysis';
      analyst.designation = 'Senior Placement Analyst';
      analyst.isApproved = true;
      analyst.isEmailVerified = true;
      await analyst.save();
      console.log('Verified Analyst account: analyst@portal.com');
    }

    // Ensure Aspirant exists in development seed
    const aspirantEmail = 'aspirant@portal.com';
    let aspirantUser = await User.findOne({ email: aspirantEmail });
    if (!aspirantUser) {
      aspirantUser = await User.create({
        name: 'Aarav Sharma (Prospective Student)',
        email: aspirantEmail,
        password: 'Gateway#2026!Pathway',
        role: 'aspirant',
        isApproved: true,
        isEmailVerified: true,
      });
      console.log('Created default Aspirant: aspirant@portal.com');
    } else {
      aspirantUser.role = 'aspirant';
      aspirantUser.password = 'Gateway#2026!Pathway';
      aspirantUser.isApproved = true;
      aspirantUser.isEmailVerified = true;
      await aspirantUser.save();
      console.log('Verified Aspirant account: aspirant@portal.com');
    }

    let aspirantProfile = await Aspirant.findOne({ user: aspirantUser._id });
    if (!aspirantProfile) {
      await Aspirant.create({
        user: aspirantUser._id,
        state: 'Delhi',
        interestedBranches: ['CSE', 'IT'],
        twelfthStream: 'Science (PCM)',
        shortlistedColleges: [college1._id, college2._id],
        savedComparisons: [
          {
            name: 'NIT Delhi vs PICT Pune',
            colleges: [college1._id, college2._id],
            createdAt: new Date(),
          },
        ],
      });
      console.log('Created default Aspirant profile with shortlist and comparisons');
    } else {
      aspirantProfile.shortlistedColleges = [college1._id, college2._id];
      aspirantProfile.savedComparisons = [
        {
          name: 'NIT Delhi vs PICT Pune',
          colleges: [college1._id, college2._id],
          createdAt: new Date(),
        },
      ];
      await aspirantProfile.save();
      console.log('Updated Aspirant profile with active college references');
    }

    // Seed Sample Job Requirements for Google Recruiter
    console.log('2.1 Seeding sample Job Requirements for Recruiter...');
    const createdRequirements = await JobRequirement.create([
      {
        company: googleCompany._id,
        title: 'Software Engineer - University Graduate 2026',
        description:
          'Design and develop scalable, high-throughput cloud infrastructure and distributed algorithms.',
        packageLpa: 32.0,
        openings: 12,
        skills: ['C++', 'Python', 'Go', 'Distributed Systems', 'Data Structures'],
        minCgpa: 8.5,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        batchYear: 2026,
        selectionRounds: [
          'Online Assessment',
          'Technical Coding Round 1',
          'Technical Coding Round 2',
          'Googleyness & Leadership',
        ],
        location: 'Bengaluru / Hyderabad',
        status: 'published',
      },
      {
        company: googleCompany._id,
        title: 'Cloud Solutions Specialist & Systems Engineer',
        description:
          'Partner with enterprise customer engineering teams to architect reliable Google Cloud infrastructure solutions.',
        packageLpa: 26.5,
        openings: 8,
        skills: ['Kubernetes', 'Docker', 'Linux', 'Python', 'Networking'],
        minCgpa: 7.8,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        batchYear: 2025,
        selectionRounds: [
          'Aptitude & Cloud Fundamentals',
          'System Architecture Interview',
          'Managerial Fitment',
        ],
        location: 'Bengaluru / Gurugram',
        status: 'draft',
      },
      {
        company: googleCompany._id,
        title: 'Generative AI & Machine Learning Research Associate',
        description:
          'Collaborate with researchers to evaluate foundation models and train multi-modal systems.',
        packageLpa: 28.0,
        openings: 5,
        skills: ['PyTorch', 'TensorFlow', 'Python', 'Deep Learning', 'NLP'],
        minCgpa: 8.0,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        batchYear: 2025,
        selectionRounds: [
          'Research Portfolio Review',
          'ML Coding & Algorithmic Problem Solving',
          'Behavioral Round',
        ],
        location: 'Bengaluru',
        status: 'closed',
      },
    ]);

    // 2.2 Seed Sample Drive Requests
    console.log('2.2 Seeding sample Drive Requests from Recruiter to Colleges...');
    const publishedReq = createdRequirements[0];
    const futureDate1 = new Date();
    futureDate1.setDate(futureDate1.getDate() + 15);
    const futureDate2 = new Date();
    futureDate2.setDate(futureDate2.getDate() + 20);
    const altDate1 = new Date();
    altDate1.setDate(altDate1.getDate() + 25);
    const altDate2 = new Date();
    altDate2.setDate(altDate2.getDate() + 28);

    await DriveRequest.create([
      {
        jobRequirement: publishedReq._id,
        company: googleCompany._id,
        college: college1._id, // NIT Delhi
        proposedDates: [futureDate1, futureDate2],
        mode: 'on-campus',
        status: 'pending',
        timeline: [
          {
            status: 'pending',
            updatedBy: recruiterUser._id,
            updatedByRole: 'recruiter',
            updatedByName: recruiterUser.name,
            note: 'Drive request initiated with 2 proposed on-campus dates',
            date: new Date(),
          },
        ],
        messages: [
          {
            sender: recruiterUser._id,
            senderRole: 'recruiter',
            senderName: recruiterUser.name,
            text: 'Greetings from Google Talent Acquisition! We are thrilled to invite graduating engineers from NIT Delhi to participate in our upcoming campus hiring drive.',
            date: new Date(),
          },
        ],
      },
      {
        jobRequirement: publishedReq._id,
        company: googleCompany._id,
        college: college2._id, // PICT Pune
        proposedDates: [futureDate1, futureDate2],
        mode: 'virtual',
        status: 'reschedule_proposed',
        tpoProposedDates: [altDate1, altDate2],
        timeline: [
          {
            status: 'pending',
            updatedBy: recruiterUser._id,
            updatedByRole: 'recruiter',
            updatedByName: recruiterUser.name,
            note: 'Drive request initiated with 2 proposed virtual dates',
            date: new Date(Date.now() - 86400000 * 2),
          },
          {
            status: 'reschedule_proposed',
            updatedBy: tpoPune._id,
            updatedByRole: 'tpo',
            updatedByName: tpoPune.name,
            note: 'TPO proposed alternative dates due to semester practical examinations',
            date: new Date(Date.now() - 86400000),
          },
        ],
        messages: [
          {
            sender: recruiterUser._id,
            senderRole: 'recruiter',
            senderName: recruiterUser.name,
            text: 'We would love to conduct our virtual recruitment drive for PICT batch of 2026.',
            date: new Date(Date.now() - 86400000 * 2),
          },
          {
            sender: tpoPune._id,
            senderRole: 'tpo',
            senderName: tpoPune.name,
            text: 'Thank you for reaching out! Our students have mid-semester practicals on those dates. Would it be feasible to conduct the online assessments on the proposed dates instead?',
            date: new Date(Date.now() - 86400000),
          },
        ],
      },
    ]);

    // 3. Insert 25 Realistic Placement Drives
    console.log('3. Inserting 25 Placement Drives across branches and years...');
    const drivesData = [
      // Tech Drives (CSE, IT, ECE)
      {
        company: companyMap['Tata Consultancy Services (TCS)'],
        role: 'Assistant System Engineer (Ninja & Digital)',
        packageLpa: 7.2,
        location: 'Pan India / Pune',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2024-03-15'),
        driveDate: new Date('2024-03-25'),
        status: 'closed',
      },
      {
        company: companyMap['Infosys'],
        role: 'Specialist Programmer (Power Programmer)',
        packageLpa: 9.5,
        location: 'Bengaluru / Hyderabad',
        minCgpa: 7.0,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: new Date('2024-04-10'),
        driveDate: new Date('2024-04-20'),
        status: 'closed',
      },
      {
        company: companyMap['Wipro'],
        role: 'Turbo Candidate - Full Stack Developer',
        packageLpa: 6.5,
        location: 'Bengaluru',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2023-10-15'),
        driveDate: new Date('2023-10-25'),
        status: 'closed',
      },
      {
        company: companyMap['Accenture'],
        role: 'Advanced Application Engineering Analyst',
        packageLpa: 8.5,
        location: 'Gurugram / Noida',
        minCgpa: 6.8,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2024-02-28'),
        driveDate: new Date('2024-03-10'),
        status: 'closed',
      },
      {
        company: companyMap['Cognizant'],
        role: 'GenC Next - Cloud & DevOps Specialist',
        packageLpa: 6.75,
        location: 'Chennai / Coimbatore',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: new Date('2023-11-20'),
        driveDate: new Date('2023-11-30'),
        status: 'closed',
      },
      {
        company: companyMap['Capgemini'],
        role: 'Senior Software Analyst',
        packageLpa: 7.5,
        location: 'Mumbai / Pune',
        minCgpa: 6.5,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2025-01-15'),
        driveDate: new Date('2025-01-25'),
        status: 'closed',
      },
      {
        company: companyMap['Tech Mahindra'],
        role: 'Associate Software Engineer',
        packageLpa: 5.5,
        location: 'Hyderabad',
        minCgpa: 6.0,
        maxBacklogs: 2,
        allowedBranches: ['CSE', 'IT', 'ECE', 'ME'],
        lastDateToApply: new Date('2023-09-10'),
        driveDate: new Date('2023-09-20'),
        status: 'closed',
      },
      {
        company: companyMap['HCL Technologies'],
        role: 'Software Development Associate',
        packageLpa: 6.0,
        location: 'Noida / Lucknow',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2024-11-05'),
        driveDate: new Date('2024-11-15'),
        status: 'closed',
      },
      {
        company: companyMap['Google'],
        role: 'Software Engineer - University Graduate',
        packageLpa: 32.0,
        location: 'Bengaluru / Hyderabad',
        minCgpa: 8.5,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: new Date('2025-02-15'),
        driveDate: new Date('2025-02-28'),
        status: 'closed',
      },
      {
        company: companyMap['Microsoft'],
        role: 'Software Development Engineer (SDE 1)',
        packageLpa: 28.5,
        location: 'Hyderabad / Noida',
        minCgpa: 8.0,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2024-09-15'),
        driveDate: new Date('2024-09-28'),
        status: 'closed',
      },
      {
        company: companyMap['Amazon'],
        role: 'SDE - Cloud & Distributed Systems',
        packageLpa: 26.0,
        location: 'Bengaluru',
        minCgpa: 7.8,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: new Date('2024-10-10'),
        driveDate: new Date('2024-10-22'),
        status: 'closed',
      },
      {
        company: companyMap['Cisco Systems'],
        role: 'Network Software Engineer',
        packageLpa: 17.5,
        location: 'Bengaluru',
        minCgpa: 7.5,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2025-03-01'),
        driveDate: new Date('2025-03-12'),
        status: 'closed',
      },
      {
        company: companyMap['Deloitte'],
        role: 'Technology Analyst - Cyber Risk & Advisory',
        packageLpa: 10.0,
        location: 'Hyderabad / Mumbai',
        minCgpa: 7.0,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2025-03-15'),
        driveDate: new Date('2025-03-25'),
        status: 'closed',
      },

      // Core Engineering Drives (ME, CE)
      {
        company: companyMap['Larsen & Toubro (L&T)'],
        role: 'Graduate Engineer Trainee (Civil Engineering)',
        packageLpa: 6.5,
        location: 'Chennai / Mumbai / Sites',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['CE'],
        lastDateToApply: new Date('2024-04-05'),
        driveDate: new Date('2024-04-18'),
        status: 'closed',
      },
      {
        company: companyMap['Larsen & Toubro (L&T)'],
        role: 'Graduate Engineer Trainee (Mechanical Projects)',
        packageLpa: 6.8,
        location: 'Hazira / Vadodara',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['ME'],
        lastDateToApply: new Date('2024-04-08'),
        driveDate: new Date('2024-04-20'),
        status: 'closed',
      },
      {
        company: companyMap['Tata Motors'],
        role: 'Design & Validation Engineer',
        packageLpa: 8.0,
        location: 'Pune / Jamshedpur',
        minCgpa: 7.0,
        maxBacklogs: 0,
        allowedBranches: ['ME', 'ECE'],
        lastDateToApply: new Date('2024-05-10'),
        driveDate: new Date('2024-05-22'),
        status: 'closed',
      },
      {
        company: companyMap['Tata Motors'],
        role: 'Plant Operations & Manufacturing Trainee',
        packageLpa: 6.2,
        location: 'Sanand / Pantnagar',
        minCgpa: 6.2,
        maxBacklogs: 1,
        allowedBranches: ['ME'],
        lastDateToApply: new Date('2023-11-10'),
        driveDate: new Date('2023-11-22'),
        status: 'closed',
      },

      // 2025 / 2026 Batch Drives (Some open for applications)
      {
        company: companyMap['Tata Consultancy Services (TCS)'],
        role: 'Prime & Digital Developer (2025-26)',
        packageLpa: 9.0,
        location: 'Pan India',
        minCgpa: 6.8,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2026-12-15'),
        driveDate: new Date('2026-12-25'),
        status: 'open',
      },
      {
        company: companyMap['Accenture'],
        role: 'Packaged App Development Specialist',
        packageLpa: 8.8,
        location: 'Bengaluru / Pune',
        minCgpa: 6.5,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2026-12-30'),
        driveDate: new Date('2027-01-15'),
        status: 'open',
      },
      {
        company: companyMap['Infosys'],
        role: 'Systems Engineer Specialist (2026)',
        packageLpa: 7.5,
        location: 'Mysuru / Bengaluru',
        minCgpa: 6.5,
        maxBacklogs: 1,
        allowedBranches: ['CSE', 'IT', 'ECE', 'ME', 'CE'],
        lastDateToApply: new Date('2027-01-10'),
        driveDate: new Date('2027-01-20'),
        status: 'open',
      },
      {
        company: companyMap['Microsoft'],
        role: 'Azure Cloud Solution Engineer (2026)',
        packageLpa: 24.0,
        location: 'Hyderabad',
        minCgpa: 8.0,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: new Date('2026-12-20'),
        driveDate: new Date('2027-01-05'),
        status: 'open',
      },
      {
        company: companyMap['Google'],
        role: 'Cloud Engineering Fellow (2026)',
        packageLpa: 30.0,
        location: 'Bengaluru',
        minCgpa: 8.2,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT'],
        lastDateToApply: new Date('2027-01-30'),
        driveDate: new Date('2027-02-15'),
        status: 'open',
      },
      {
        company: companyMap['Larsen & Toubro (L&T)'],
        role: 'Smart Infrastructure & City Solutions Engineer',
        packageLpa: 7.5,
        location: 'Mumbai / Delhi NCR',
        minCgpa: 6.8,
        maxBacklogs: 0,
        allowedBranches: ['CE', 'ME'],
        lastDateToApply: new Date('2026-12-10'),
        driveDate: new Date('2026-12-22'),
        status: 'open',
      },
      {
        company: companyMap['Deloitte'],
        role: 'Enterprise Analytics Consultant',
        packageLpa: 11.0,
        location: 'Bengaluru / Gurugram',
        minCgpa: 7.2,
        maxBacklogs: 0,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2026-11-30'),
        driveDate: new Date('2026-12-10'),
        status: 'open',
      },
      {
        company: companyMap['Cognizant'],
        role: 'Full Stack & AI Engineer (2026)',
        packageLpa: 7.8,
        location: 'Kolkata / Hyderabad',
        minCgpa: 6.6,
        maxBacklogs: 1,
        allowedBranches: ['CSE', 'IT', 'ECE'],
        lastDateToApply: new Date('2027-01-25'),
        driveDate: new Date('2027-02-05'),
        status: 'open',
      },
    ];

    const allDemoColleges = [college1, college2, college3, college4];
    const collegePrefixes = ['0101', '0202', '0303', '0404'];

    const createdDrives = await Drive.insertMany(
      drivesData.map((d, idx) => ({
        ...d,
        college: allDemoColleges[idx % allDemoColleges.length]._id,
      }))
    );
    console.log(`Successfully created ${createdDrives.length} drives across all colleges.`);

    // 4. Generate 100 Realistic Students (25 per college, satisfying >= 20 requirement)
    console.log('4. Generating 100 students across CSE, IT, ECE, ME, CE for batch years 2023 to 2026 (25 per college)...');
    const hashedStudentPassword = await bcrypt.hash('Quantum#2026!Target', 10);

    const branches = ['CSE', 'IT', 'ECE', 'ME', 'CE'];
    const years = [2023, 2024, 2025, 2026];

    // Branch weighting: CSE (35), IT (25), ECE (20), ME (10), CE (10)
    const branchDistribution = [
      ...Array(35).fill('CSE'),
      ...Array(25).fill('IT'),
      ...Array(20).fill('ECE'),
      ...Array(10).fill('ME'),
      ...Array(10).fill('CE'),
    ];

    const studentUsers = [];
    const studentsData = [];

    for (let i = 0; i < 100; i++) {
      const fn = FIRST_NAMES[i % FIRST_NAMES.length];
      const ln = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
      const fullName = `${fn} ${ln}`;
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i + 1}@college.com`;

      const branch = branchDistribution[i];
      const batchYear = years[i % years.length];
      const code = branch === 'ME' ? 'ME' : branch === 'CE' ? 'CE' : branch;
      const serial = String(i + 1).padStart(3, '0');
      const targetCollege = allDemoColleges[i % allDemoColleges.length];
      const collegePrefix = collegePrefixes[i % collegePrefixes.length];
      const enrollmentNo = `${collegePrefix}${code}${String(batchYear).slice(2)}${serial}`;

      // Realistic CGPA: between 6.20 and 9.75 with typical bell curve
      const baseCgpa = 6.2 + Math.random() * 3.5;
      const cgpa = Number(baseCgpa.toFixed(2));

      // Backlogs: mostly 0, occasionally 1
      const backlogs = Math.random() < 0.85 ? 0 : Math.random() < 0.8 ? 1 : 2;

      const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;

      // Pick 3 to 6 skills
      const numSkills = 3 + Math.floor(Math.random() * 4);
      const shuffledSkills = [...SKILLS_POOL].sort(() => 0.5 - Math.random());
      const skills = shuffledSkills.slice(0, numSkills);

      const userId = new mongoose.Types.ObjectId();
      studentUsers.push({
        _id: userId,
        name: fullName,
        email,
        password: hashedStudentPassword,
        role: 'student',
        college: targetCollege._id,
        isApproved: true,
        isEmailVerified: true,
      });

      studentsData.push({
        user: userId,
        college: targetCollege._id,
        enrollmentNo,
        branch,
        batchYear,
        cgpa,
        backlogs,
        phone,
        skills,
        resumeUrl: '',
      });
    }

    // Add 2 students for College 5 (LDRP) to test small cohort (< 5) rule
    for (let k = 1; k <= 2; k++) {
      const uId = new mongoose.Types.ObjectId();
      studentUsers.push({
        _id: uId,
        name: `LDRP Student ${k}`,
        email: `ldrp.student${k}@portal.com`,
        password: hashedStudentPassword,
        role: 'student',
        college: college5._id,
        isApproved: true,
        isEmailVerified: true,
      });
      studentsData.push({
        user: uId,
        college: college5._id,
        enrollmentNo: `LDRP202500${k}`,
        branch: 'CSE',
        batchYear: 2025,
        cgpa: 8.0,
        backlogs: 0,
        phone: `987900000${k}`,
        skills: ['React', 'JavaScript'],
        resumeUrl: '',
      });
    }

    // Insert Users and Students
    const insertedUsers = await User.insertMany(studentUsers);
    const insertedStudents = await Student.insertMany(studentsData);
    console.log(`Successfully created ${insertedStudents.length} student records.`);

    // 5. Generate Realistic Applications & Placements
    console.log('5. Generating application records and placement offers with realistic conversion rates...');
    const applicationsToInsert = [];
    const placementsToInsert = [];

    // Target Placement Success Rates:
    // CSE: ~88%, IT: ~84%, ECE: ~75%, ME: ~65%, CE: ~60%
    const placementRateByBranch = {
      CSE: 0.88,
      IT: 0.84,
      ECE: 0.75,
      ME: 0.65,
      CE: 0.60,
    };

    for (const student of insertedStudents) {
      // Find drives matching student's branch, CGPA, and backlogs
      const eligibleDrives = createdDrives.filter((d) => {
        const branchMatch = d.allowedBranches.includes(student.branch);
        const cgpaMatch = student.cgpa >= d.minCgpa;
        const backlogMatch = student.backlogs <= d.maxBacklogs;
        return branchMatch && cgpaMatch && backlogMatch;
      });

      if (eligibleDrives.length === 0) continue;

      // Student applies to 2 to 5 matching drives
      const applyCount = Math.min(
        eligibleDrives.length,
        Math.max(2, Math.floor(Math.random() * 5) + 1)
      );
      const appliedDrives = [...eligibleDrives]
        .sort(() => 0.5 - Math.random())
        .slice(0, applyCount);

      // Determine if student will be placed
      const targetRate = placementRateByBranch[student.branch] || 0.75;
      const isPlaced = Math.random() < targetRate;

      // Select one drive as the placed offer if placed
      const placedDrive = isPlaced ? appliedDrives[0] : null;

      for (const drive of appliedDrives) {
        let status = 'applied';

        if (placedDrive && drive._id.toString() === placedDrive._id.toString()) {
          status = 'selected';
        } else {
          // Other applications have realistic statuses
          const roll = Math.random();
          if (roll < 0.25) status = 'applied';
          else if (roll < 0.5) status = 'shortlisted';
          else if (roll < 0.75) status = 'interview';
          else status = 'rejected';
        }

        const appDate = new Date(drive.driveDate.getTime() - 86400000 * 10);

        applicationsToInsert.push({
          student: student._id,
          drive: drive._id,
          status,
          appliedOn: appDate,
        });

        // If selected, record corresponding Placement
        if (status === 'selected') {
          placementsToInsert.push({
            student: student._id,
            drive: drive._id,
            company: drive.company,
            packageLpa: drive.packageLpa,
            offerDate: drive.driveDate,
          });
        }
      }
    }

    const createdApplications = await Application.insertMany(applicationsToInsert);
    const createdPlacements = await Placement.insertMany(placementsToInsert);

    console.log(`\n================ SEED SUMMARY ================`);
    console.log(`Colleges Seeded      : 4 (${college1.code}, ${college2.code}, ${college3.code}, ${college4.code})`);
    console.log(`Companies Seeded     : ${createdCompanies.length}`);
    console.log(`Drives Created       : ${createdDrives.length}`);
    console.log(`Requirements Seeded  : 3 (Google)`);
    console.log(`Students Created     : ${insertedStudents.length} (25 per college, all >= 20)`);
    console.log(`Applications Created : ${createdApplications.length}`);
    console.log(`Placements Created   : ${createdPlacements.length}`);
    console.log(
      `Overall Placement Rate: ${(
        (createdPlacements.length / insertedStudents.length) *
        100
      ).toFixed(2)}%`
    );
    console.log(`NITD TPO Login       : admin@college.com / Admin@123`);
    console.log(`PICT TPO Login       : tpo.pict@college.com / Admin@123`);
    console.log(`Recruiter Login      : recruiter@google.com / Recruiter@123`);
    console.log(`Analyst Login        : analyst@portal.com / Analyst@123`);
    console.log(`Superadmin Login     : superadmin@portal.com / Super@12345`);
    console.log(`Aspirant Login       : aspirant@portal.com / Aspirant@123`);
    console.log(`Sample Student Login : ${studentUsers[0].email} / Student@123`);
    console.log(`==============================================\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed process failed:', error);
    process.exit(1);
  }
};

seedData();

