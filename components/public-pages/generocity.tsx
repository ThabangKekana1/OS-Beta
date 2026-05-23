import React from 'react';
import { SingleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import { BUSINESS_REGISTRATION_URL } from '@/lib/links';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Generocity | 1OS',
    description: '1OS presents Generocity — fully funded solar installations for qualifying South African businesses. No upfront cost, immediate energy savings.',
    alternates: {
        canonical: '/generocity',
    },
};

export default function GenerocityPage() {
    return (
        <LandingContainer>
            {/* HERO - Single */}
            <SingleSection
                item={{
                    title: 'Introducing Generocity.\nSolar for your business.',
                    description: '1OS presents Generocity — fully funded solar installations for qualifying South African businesses. No upfront cost, immediate energy savings.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Apply Now',
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/generocity-hero-new.jpg'
                }}
            />

            {/* VALUE - Carousel */}
            <CarouselSection
                title="What zero capital expenditure means."
                description="Your business gets a solar installation with no upfront payment, no financing applications, and no balance sheet impact."
                items={[
                    {
                        tag: '01',
                        title: 'No upfront cost',
                        description: 'The entire solar system — panels, inverters, installation — is funded. Pay nothing to get started.',
                        cardBg: '#ffff80', // Yellow
                        image: '/no-upfront-cost.jpg'
                    },
                    {
                        tag: '02',
                        title: 'Immediate savings',
                        description: 'From day one, you reduce your electricity bill. Solar power offsets your grid consumption directly.',
                        cardBg: '#ffb3ff', // Pink
                        image: '/immediate-savings.jpg'
                    },
                    {
                        tag: '03',
                        title: 'No maintenance',
                        description: 'System monitoring and performance guarantees are handled entirely by us. You focus on your business.',
                        cardBg: '#80d4ff', // Blue
                        image: '/no-maintenance.jpg'
                    }
                ]}
            />

            {/* WHO - Carousel */}
            <CarouselSection
                title="Who is this for?"
                description="Generocity by 1OS is designed for commercial and industrial businesses in South Africa that meet specific qualification criteria."
                items={[
                    { title: 'Commercial, Governmental and Non-profits', description: 'Businesses of all sizes including stores, shops, guesthouses, malls, factories, warehouses, schools and churches.', cardBg: '#b3ffb3', image: '/commercial-businesses.jpg' }, // Green
                    { title: 'R10,000+', description: 'Minimum monthly electricity expenditure to qualify for funding.', cardBg: '#ffffb3', image: '/electricity-bill-threshold.png' }, // Light Yellow
                    { title: 'Suitable area', description: 'Unshaded area for high-yield solar panel placement and efficiency.', cardBg: '#e6ccff', image: '/suitable-area.png' }, // Lavender
                    { title: 'Must be Operating', description: 'Registered PTY Ltd, CC or NGO with established history and stability.', cardBg: '#ffccd5', image: '/must-be-operating.png' }, // Soft Red
                    { title: 'South African', description: 'Business must be based and operating within the Republic.', cardBg: '#d1f2eb', image: '/south-african-business.jpg' } // Mint
                ]}
            />

            {/* PROCESS - Carousel */}
            <CarouselSection
                title="The process."
                description="From first contact to energy savings in four clear steps."
                items={[
                    { tag: '1', title: 'Business qualification', description: 'Your business details are assessed against strict criteria to ensure eligibility for zero capital expenditure solar.', image: '/business-qualification.jpg' },
                    { tag: '2', title: 'Partner feasibility', description: '1OS conducts a technical and financial feasibility assessment of your premises.', image: '/partner-feasibility.png' },
                    { tag: '3', title: 'Installation', description: 'Approved projects proceed to system design and professional installation with zero cost to you.', image: '/installation-progress.jpg' },
                    { tag: '4', title: 'Ongoing savings', description: 'Your system generates clean energy, reducing your electricity costs from day one with ongoing monitoring.', image: '/ongoing-savings.jpg' }
                ]}
            />

            {/* CREDIBILITY - Single */}
            <SingleSection
                item={{
                    title: 'Institutional financing.',
                    description: 'All installations are financed through a dedicated institutional facility. Established-grade financing ensures reliability and long-term commitment.',
                    image: '/generocity-hero-new.jpg',
                    bgColor: '#006241',
                    textColor: '#ffffff'
                }}
            />

            {/* FINAL CTA - Single */}
            <SingleSection
                item={{
                    title: 'Ready to reduce your energy costs?',
                    description: 'Find out if your business qualifies for Generocity — zero capital expenditure solar by 1OS.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Check Eligibility',
                    buttonTheme: 'lightPanelGlass',
                    bgColor: '#f1f1f1',
                    textColor: '#000000',
                    image: '/generocity-footer.jpg'
                }}
            />
        </LandingContainer>
    );
}
