'use strict';

const globals = require('../globals');

const colUtils = require('../utils/columnUtils');



exports.create = async (city, citySlug, shopifyStoreId, deliveryCutoffCst, pickupCutoffCst,
	logoUrl, emailListName, facebookUrl, facebookPixelId, instagramUrl,
	contactEmail, deliveryEmail, careersEmail, mainContent, metaTitle, metaDescription,
	metaAuthor, metaRobots) => {

	var maxId = await globals.pool.query("SELECT MAX(id) AS max FROM targeted_cities");
	var nextId = maxId[0].max + 1;

	var cols = `id, city, city_slug, shopify_store_id, delivery_cutoff_cst, pickup_cutoff_cst`;
	var placeholders = `?, ?, ?, ?, ?, ?`;
	var values = [nextId, city, citySlug, shopifyStoreId, deliveryCutoffCst, pickupCutoffCst];

	if (logoUrl !== undefined) {
		cols += `, logo_url`;
		placeholders += `, ?`;
		values.push(logoUrl);
	}

	if (emailListName !== undefined) {
		cols += `, email_list_name`;
		placeholders += `, ?`;
		values.push(emailListName);
	}

	if (facebookUrl !== undefined) {
		cols += `, facebook_url`;
		placeholders += `, ?`;
		values.push(facebookUrl);
	}

	if (facebookPixelId !== undefined) {
		cols += `, facebook_pixel_id`;
		placeholders += `, ?`;
		values.push(facebookPixelId);
	}

	if (instagramUrl !== undefined) {
		cols += `, instagram_url`;
		placeholders += `, ?`;
		values.push(instagramUrl);
	}

	if (contactEmail !== undefined) {
		cols += `, contact_email`;
		placeholders += `, ?`;
		values.push(contactEmail);
	}

	if (deliveryEmail !== undefined) {
		cols += `, delivery_email`;
		placeholders += `, ?`;
		values.push(deliveryEmail);
	}

	if (careersEmail !== undefined) {
		cols += `, careers_email`;
		placeholders += `, ?`;
		values.push(careersEmail);
	}

	if (mainContent !== undefined) {
		cols += `, main_content`;
		placeholders += `, ?`;
		values.push(mainContent);
	}

	if (metaTitle !== undefined) {
		cols += `, meta_title`;
		placeholders += `, ?`;
		values.push(metaTitle);
	}

	if (metaDescription !== undefined) {
		cols += `, meta_description`;
		placeholders += `, ?`;
		values.push(metaDescription);
	}

	if (metaAuthor !== undefined) {
		cols += `, meta_author`;
		placeholders += `, ?`;
		values.push(metaAuthor);
	}

	if (metaRobots !== undefined) {
		cols += `, meta_robots`;
		placeholders += `, ?`;
		values.push(metaRobots);
	}


	var sql = `INSERT INTO targeted_cities (${cols}) VALUES (${placeholders})`;

	var result = await globals.pool.query(sql, values);

	return nextId;
}



exports.getAll = () => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT t.*, s.tidio_url FROM targeted_cities t LEFT JOIN shopify_stores s ON t.shopify_store_id = s.id")
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.getById = async (id) => {
	var rows = await globals.pool.query("SELECT * FROM targeted_cities t WHERE id = ?", [id]);
	colUtils.outboundNaming(rows);
	return rows;
}


exports.getByName = (city) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT * FROM targeted_cities t WHERE city = ?", [city])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}



exports.getCutoffs = async (cityId) => {
	var cutoffs = {
		deliveryCutoffCst: "12:00",
		pickupCutoffCst: "14:00"
	}

	var rows = await globals.pool.query("SELECT delivery_cutoff_cst, pickup_cutoff_cst FROM targeted_cities WHERE id = ?", [cityId]);
	if (rows.length > 0) {
		colUtils.outboundNaming(rows);
		cutoffs.deliveryCutoffCst = rows[0].deliveryCutoffCst;
		cutoffs.pickupCutoffCst = rows[0].pickupCutoffCst;
	}

	return cutoffs;
}



exports.getTargetCity = (city) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT t.*, s.tidio_url FROM targeted_cities t LEFT JOIN shopify_stores s ON t.shopify_store_id = s.id WHERE city_slug = ?", [city])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}




exports.getTargetCityById = (cityId) => {
	return new Promise((resolve, reject) => {
		globals.pool.query("SELECT t.* FROM targeted_cities t WHERE id = ?", [cityId])
			.then((rows) => {
				colUtils.outboundNaming(rows);
				resolve(rows);
			})
			.catch((e) => {
				reject(e);
			})
	});
}


exports.updateById = async (id, body) => {

	var setInfo = '';
	var values = [];


	if (body.deliveryCutoffCst !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `delivery_cutoff_cst = ?`;
		values.push(body.deliveryCutoffCst);
	}

	if (body.pickupCutoffCst !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `pickup_cutoff_cst = ?`;
		values.push(body.pickupCutoffCst);
	}

	if (body.logoUrl !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `logo_url = ?`;
		values.push(body.logoUrl);
	}

	if (body.emailListName !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `email_list_name = ?`;
		values.push(body.emailListName);	
	}

	if (body.facebookUrl !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `facebook_url = ?`;
		values.push(body.facebookUrl);	
	}

	if (body.facebookPixelId !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `facebook_pixel_id = ?`;
		values.push(body.facebookPixelId);	
	}

	if (body.instagramUrl !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `instagram_url = ?`;
		values.push(body.instagram_url);	
	}

	if (body.contactEmail !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `contact_email = ?`;
		values.push(body.contactEmail);	
	}

	if (body.deliveryEmail !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `delivery_email = ?`;
		values.push(body.deliveryEmail);	
	}

	if (body.careersEmail !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `careers_email = ?`;
		values.push(body.careersEmail);	
	}

	if (body.mainContent !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `main_content = ?`;
		values.push(mainContent);
	}

	if (body.metaTitle !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `meta_title = ?`;
		values.push(metaTitle);
	}

	if (body.metaDescription !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `meta_description = ?`;
		values.push(metaDescription);
	}

	if (body.metaAuthor !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `meta_author = ?`;
		values.push(metaAuthor);
	}

	if (body.metaRobots !== undefined) {
		if (setInfo.length > 0) {
			setInfo += ', ';
		}
		setInfo += `meta_robots = ?`;
		values.push(metaRobots);
	}


	var result = null;
	if (setInfo.length > 0) {
		var sql = `UPDATE targeted_cities SET ${setInfo} WHERE id = ${id}`;
		var result = await globals.pool.query(sql, values);
	}

	return result;
}



exports.getLargeItemFee = async (zip) => {
	let largeItemFee = await globals.pool.query("SELECT t.large_item_fee, t.shopify_large_item_fee_rate FROM targeted_cities t LEFT JOIN zip_to_city z ON t.id = z.city_id WHERE z.zip = ?", [zip]);
	colUtils.outboundNaming(largeItemFee);

	return largeItemFee;
}


