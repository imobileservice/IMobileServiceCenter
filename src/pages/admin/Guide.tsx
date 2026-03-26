"use client"

import React from "react"
import { motion } from "framer-motion"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import AdminLayout from "@/components/admin-layout"
import { BookOpen } from "lucide-react"

const guideSteps = [
    {
        value: "item-1",
        titleEn: "Dashboard Overview",
        titleSi: "ඩෑෂ්බෝඩ් (Dashboard) දළ විශ්ලේෂණය",
        contentEn: "The Dashboard provides a quick summary of your shop's performance. Here, you can see your total revenue, number of orders, and a list of your most recent transactions. You can also view sales charts to track your growth over time.",
        contentSi: "ඩෑෂ්බෝඩ් එක මඟින් ඔබේ වෙළඳසැලේ ක්‍රියාකාරිත්වය පිළිබඳ ඉක්මන් සාරාංශයක් සපයයි. මෙහිදී ඔබට ඔබේ මුළු ආදායම, ඇණවුම් සංඛ්‍යාව සහ ඔබගේ මෑත කාලීන ගනුදෙනු ලැයිස්තුවක් දැක ගත හැක. කාලයත් සමඟ ඔබේ වර්ධනය නිරීක්ෂණය කිරීමට විකුණුම් ප්‍රස්ථාර (Sales Charts) ද බැලිය හැක.",
    },
    {
        value: "item-2",
        titleEn: "Managing Products",
        titleSi: "නිෂ්පාදන පරිපාලනය (Products)",
        contentEn: "Use the Products page to add, edit, or remove items from your shop. Click 'Add Product' to enter details like name, price, description, images, brand, and available stock. Once saved, the product will immediately appear on your storefront.",
        contentSi: "ඔබගේ වෙළඳසැලට භාණ්ඩ එක් කිරීමට, වෙනස් කිරීමට හෝ ඉවත් කිරීමට නිෂ්පාදන (Products) පිටුව භාවිතා කරන්න. නම, මිල, විස්තර, පින්තූර, වෙළඳ නාමය සහ පවතින තොගය වැනි තොරතුරු ඇතුළත් කිරීමට 'Add Product' (නිෂ්පාදනයක් එක් කරන්න) ඔබන්න. සුරැකි පසු (Saved), නිෂ්පාදනය වහාම ඔබේ වෙළඳසැලෙහි දිස්වනු ඇත.",
    },
    {
        value: "item-3",
        titleEn: "Handling Categories",
        titleSi: "ප්‍රවර්ග පරිපාලනය (Categories)",
        contentEn: "Categories help organize your products (e.g., Mobile Phones, Tablets). You can create main categories and subcategories (like Apple or Samsung under Mobile Phones). It's important to assign products to the correct categories so customers can find them easily.",
        contentSi: "ප්‍රවර්ග මඟින් ඔබේ නිෂ්පාදන සංවිධානය කිරීමට (උදා: ජංගම දුරකථන, ටැබ්ලට්) උපකාරී වේ. ඔබට ප්‍රධාන ප්‍රවර්ග සහ උප ප්‍රවර්ග සැකසිය හැක (ජංගම දුරකථන යටතේ Apple හෝ Samsung වැනි). පාරිභෝගිකයින්ට පහසුවෙන් සොයා ගැනීමට හැකි වන පරිදි නිෂ්පාදන නිවැරදි ප්‍රවර්ග වලට ඇතුළත් කිරීම වැදගත් වේ.",
    },
    {
        value: "item-4",
        titleEn: "Setting Up Filters",
        titleSi: "පෙරහන් සැකසීම (Filters)",
        contentEn: "Filters allow customers to search for products based on specific attributes like Storage space (64GB, 128GB) or Color (Black, White). Create these filter groups in the Filters section and then assign them to your products when adding or editing them.",
        contentSi: "ආචයන ඉඩ (64GB, 128GB) හෝ වර්ණය (කළු, සුදු) වැනි විශේෂිත ලක්ෂණ මත පදනම්ව නිෂ්පාදන සෙවීමට පෙරහන් පාරිභෝගිකයින්ට ඉඩ සලසයි. පෙරහන් (Filters) පිටුවෙන් මෙම පෙරහන් කාණ්ඩ සාදා, පසුව නිෂ්පාදන එකතු කිරීමේදී හෝ සංස්කරණය කිරීමේදී ඒවාට අනුයුක්ත කරන්න.",
    },
    {
        value: "item-5",
        titleEn: "Processing Orders",
        titleSi: "ඇණවුම් පිරිසැකසුම් කිරීම (Orders)",
        contentEn: "When a customer buys something, it appears in the Orders section. You can view the order details, customer information, and shipping address. Mark orders as 'Processing', 'Shipped', or 'Delivered' as you fulfill them to keep the customer updated.",
        contentSi: "පාරිභෝගිකයෙකු යමක් මිලදී ගත් විට, එය ඇණවුම් (Orders) පිටුවෙ පෙන්නුම් කෙරේ. ඔබට ඇණවුම් විස්තර, පාරිභෝගික තොරතුරු සහ නැව්ගත කිරීමේ (shipping) ලිපිනය බැලිය හැක. පාරිභෝගිකයාට දැනුම් දීම සඳහා ඇණවුම් සම්පූර්ණ කරන විට ඒවා 'Processing' (ක්‍රියාත්මක වෙමින් පවතී), 'Shipped' (නැව්ගත කර ඇත) හෝ 'Delivered' (බාරදී ඇත) ලෙස සලකුණු කරන්න.",
    },
    {
        value: "item-6",
        titleEn: "Viewing Customers",
        titleSi: "පාරිභෝගිකයින් බැලීම (Customers)",
        contentEn: "The Customers page lists everyone who has created an account or placed an order on your site. You can view their contact details and order history here.",
        contentSi: "පාරිභෝගිකයින්ගේ (Customers) පිටුව ඔබගේ වෙබ් අඩවියේ ගිණුමක් ලියාපදිංචි කර ඇති හෝ ඇණවුමක් කර ඇති සියලු දෙනාම ලැයිස්තුගත කරයි. ඔබට ඔවුන්ගේ සම්බන්ධතා තොරතුරු සහ ඇණවුම් ඉතිහාසය මෙතැනින් බැලිය හැක.",
    },
    {
        value: "item-7",
        titleEn: "Managing Messages",
        titleSi: "පණිවිඩ පරිපාලනය (Messages)",
        contentEn: "Any inquiries submitted through the 'Contact Us' page on your website will appear here. You can read customer questions or complaints and follow up with them via email or phone.",
        contentSi: "ඔබගේ වෙබ් අඩවියේ 'Contact Us' (අප හා සම්බන්ධ වන්න) පිටුව හරහා ඉදිරිපත් කරන ඕනෑම විමසීමක් මෙහි දිස්වනු ඇත. ඔබට පාරිභෝගික ප්‍රශ්න හෝ පැමිණිලි කියවිය හැකි අතර විද්‍යුත් තැපෑලෙන් (email) හෝ දුරකථනයෙන් ඔවුන් පසු විපරම් කළ හැක.",
    },
    {
        value: "item-8",
        titleEn: "Updating Hero Slides",
        titleSi: "ප්‍රධාන බැනරය යාවත්කාලීන කිරීම (Hero Slides)",
        contentEn: "Hero Slides are the large promotional banner images shown at the top of your homepage. Use this section to upload new banners, change the promotional text, and set links to special offers or new products.",
        contentSi: "ප්‍රධාන බැනර් (Hero Slides) යනු ඔබේ මුල් පිටුවෙහි ඉහළින්ම පෙන්වන විශාල ප්‍රවර්ධන (promotional) පින්තූර වේ. නව බැනර් උඩුගත කිරීමට (upload), ප්‍රවර්ධන පෙළ වෙනස් කිරීමට සහ විශේෂ දීමනා හෝ නව නිෂ්පාදන වෙත සබැඳි (links) සැකසීමට මෙම කොටස භාවිත කරන්න.",
    },
    {
        value: "item-9",
        titleEn: "Store Settings",
        titleSi: "වෙළඳසැලේ සැකසුම් (Settings)",
        contentEn: "The Settings section allows you to configure basic information about your site, such as the contact email, store address, social media links, and other fundamental configurations.",
        contentSi: "සැකසුම් (Settings) පිටුව මඟින් ඔබට අමතන්නට අවශ්‍ය ඊමේල් ලිපිනය, වෙළඳසැලේ ලිපිනය, සමාජ මාධ්‍ය සබැඳි සහ වෙනත් මූලික සැකසුම් වැනි ඔබේ වෙබ් අඩවිය පිළිබඳ මූලික තොරතුරු වින්‍යාස කිරීමට (configure) ඉඩ ලබා දේ.",
    },
]

export default function AdminGuide() {
    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-primary" />
                        <h1 className="text-4xl font-bold">Admin Panel Guide</h1>
                    </div>
                    <p className="text-muted-foreground mt-2">
                        Step-by-step instructions on how to use the admin panel. / පරිපාලක පැනලය භාවිතා කරන ආකාරය පිළිබඳ පියවරෙන් පියවර උපදෙස්.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="bg-card border border-border rounded-xl p-6 shadow-sm"
                >
                    <Accordion type="single" collapsible className="w-full space-y-4">
                        {guideSteps.map((step, index) => (
                            <AccordionItem key={step.value} value={step.value} className="border border-border rounded-lg bg-background px-4">
                                <AccordionTrigger className="hover:no-underline py-4">
                                    <div className="flex flex-col items-start gap-1 text-left">
                                        <span className="font-semibold text-lg flex items-center gap-2">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm">
                                                {index + 1}
                                            </span>
                                            {step.titleEn}
                                        </span>
                                        <span className="text-muted-foreground font-medium pl-8">
                                            {step.titleSi}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pb-4 pt-2">
                                    <div className="pl-8 space-y-4">
                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-1">English</h4>
                                            <p className="text-foreground leading-relaxed">
                                                {step.contentEn}
                                            </p>
                                        </div>
                                        <div className="border-t border-border pt-4">
                                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-1">සිංහල</h4>
                                            <p className="text-foreground leading-relaxed font-medium">
                                                {step.contentSi}
                                            </p>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </motion.div>
            </div>
        </AdminLayout>
    )
}
