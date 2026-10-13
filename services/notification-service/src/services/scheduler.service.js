const cron = require('node-cron');
const {pool} = require('../config/database');
const emailConfig = require('../config/email');
const EmailNotifier = require('./notification/email.notifier');
const {DeliveryWorker} = require('./delivery-worker');
const {AnnouncementDeliveryWorker} = require('./announcement-delivery-worker');
const logger = require('../utils/logger');
const notifier = new EmailNotifier();
class SchedulerService {
  constructor() {
    this.running = false;
    this.status = {enabled:emailConfig.enabled, ready:false, last_run:null};
    this.announcementRunning = false;
    this.worker = new DeliveryWorker({pool,send:(user,items,messageId)=>notifier.sendDelivery(user,items,messageId)});
    this.announcementWorker = new AnnouncementDeliveryWorker({pool,send:(user,announcement,messageId)=>notifier.sendAnnouncement(user,announcement,messageId),frontendUrl:process.env.FRONTEND_URL});
  }
  async runOnce() {
    if (this.running) return this.status;
    this.running = true;
    try {
      let result={ready:false};
      if(emailConfig.enabled){try{result=await this.worker.runOnce();}catch{logger.error('News email worker failed; system announcements continue independently');}}
      const announcements=await this.runAnnouncementsOnce();
      this.status = {...this.status,ready:result.ready||announcements.ready,last_run:new Date().toISOString()};
      if (!result.ready && !announcements.ready) logger.warn('Notification schema unavailable; delivery remains paused');
    } catch {
      this.status.ready = false;
      logger.error('Notification worker failed; inspect database availability and delivery state');
    } finally { this.running = false; }
    return this.status;
  }
  async runAnnouncementsOnce() {
    if(this.announcementRunning)return {ready:this.status.announcements_ready===true,busy:true};
    this.announcementRunning=true;
    try {
      const result=await this.announcementWorker.runOnce({deliver:emailConfig.enabled});
      this.status.announcements_ready=result.ready;
      return result;
    } catch {this.status.announcements_ready=false;logger.error('System announcement worker failed; inspect database and delivery state');return {ready:false};}
    finally {this.announcementRunning=false;}
  }
  startScheduler() {
    if (this.task) return;
    this.task = cron.schedule('*/15 * * * *',()=>this.runOnce(),{timezone:'America/Mexico_City'});
    this.announcementTask = cron.schedule('* * * * *',()=>this.runAnnouncementsOnce(),{timezone:'America/Mexico_City'});
  }
}
module.exports = new SchedulerService();
