import React from 'react';
import { SingleSection, DoubleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Research | 1OS',
    description: 'Explore 1OS research on South African energy intelligence, grid stability, Eskom restructuring, distributed energy, and commercial solar data.',
    alternates: {
        canonical: '/research',
    },
};

export default function ResearchPage() {
    return (
        <LandingContainer>
            {/* HERO */}
            <SingleSection
                item={{
                    title: 'The Future of Power\nis Being Written Now.',
                    description: "1OS's research division drives the intelligence behind South Africa's energy transition. From Eskom unbundling to next-generation renewables — we don't just follow the data, we generate it.",
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/research-hero-main.jpg'
                }}
            />

            {/* PROVIDENCE INTRO — Double */}
            <DoubleSection
                title="Introducing Providence."
                items={[
                    {
                        title: 'Real-Time Energy Intelligence',
                        description: 'Providence turns live network telemetry into a real-time view of South Africa\'s energy system.',
                        image: '/research-providence-intelligence.png'
                    },
                    {
                        title: 'From Data to Policy',
                        description: 'We convert energy data into forecasts, research, and policy-grade insight.',
                        image: '/research-data-policy.png'
                    }
                ]}
            />

            {/* THE LANDSCAPE — Carousel */}
            <CarouselSection
                title="The Energy Landscape."
                description="Key forces reshaping South Africa's power future — and how our research is positioned at the centre."
                items={[
                    {
                        tag: 'Research Area 01',
                        title: 'Eskom Unbundling',
                        description: 'The restructuring of Eskom into Generation, Transmission, and Distribution entities is the most significant shift in SA\'s energy history. Providence tracks the regulatory, financial, and operational implications in real time — providing stakeholders with clarity in a complex transition.',
                        cardBg: '#fef3c7',
                        image: '/research-eskom-unbundling.jpg'
                    },
                    {
                        tag: 'Research Area 02',
                        title: 'Green Energy Transition',
                        description: 'South Africa\'s Integrated Resource Plan targets 17.7 GW of new renewable capacity by 2030. Our research quantifies the gap between policy ambition and on-the-ground deployment, tracking solar PV, wind, battery storage, and green hydrogen developments nationwide.',
                        cardBg: '#d1fae5',
                        image: '/research-green-transition.png'
                    },
                    {
                        tag: 'Research Area 03',
                        title: 'Grid Stability & Load Shedding',
                        description: 'Load shedding cost South Africa an estimated R899 billion between 2020 and 2024. Providence monitors grid frequency, unplanned outages, and Energy Availability Factor (EAF) to provide early-warning indicators and long-term trend analysis.',
                        cardBg: '#fee2e2',
                        image: '/research-grid-stability.jpg'
                    },
                    {
                        tag: 'Research Area 04',
                        title: 'Distributed Energy Resources',
                        description: 'The rise of rooftop solar, battery storage, and wheeled power is fundamentally changing how electricity flows. Our research maps the growth of DERs, their impact on municipal revenue, and the regulatory frameworks needed to support a decentralised grid.',
                        cardBg: '#dbeafe',
                        image: '/research-distributed-energy.jpg'
                    },
                    {
                        tag: 'Research Area 05',
                        title: 'Carbon Markets & Just Transition',
                        description: 'South Africa\'s carbon tax and international climate commitments are creating new economic dynamics. Providence models the interplay between carbon pricing, renewable certificate trading, and socioeconomic impacts on coal-dependent communities.',
                        cardBg: '#ede9fe',
                        image: '/research-carbon-markets.png'
                    }
                ]}
            />

            {/* GENEROCITY & LUMEN DATA — Double */}
            <DoubleSection
                items={[
                    {
                        title: 'Powered by Generocity Data',
                        description: 'Every Generocity site feeds Providence with live solar performance and system health data.',
                        link: '/generocity',
                        linkText: 'Explore Generocity',
                        image: '/research-generocity-data.png'
                    },
                    {
                        title: 'Powered by Lumen Data',
                        description: 'Lumen adds demand, billing, and usage intelligence to complete the supply-and-demand picture.',
                        link: '/lumen',
                        linkText: 'Explore Lumen',
                        image: '/research-lumen-data.jpg'
                    }
                ]}
            />



            {/* CTA */}
            <SingleSection
                item={{
                    title: 'Access Our Research.',
                    description: 'Providence publishes regular insights, datasets, and policy briefings. Partner with us to gain early access to the most comprehensive energy intelligence platform in South Africa.',
                    link: '/contact',
                    linkText: 'Request access',
                    secondaryLink: '/company',
                    secondaryLinkText: 'About 1OS',
                    bgColor: '#0f172a',
                    textColor: '#ffffff',
                    image: '/research-generocity-data.jpg'
                }}
            />
        </LandingContainer>
    );
}
